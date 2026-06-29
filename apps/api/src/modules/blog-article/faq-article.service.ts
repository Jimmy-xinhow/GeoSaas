import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import pLimit from '@/common/utils/p-limit';
import { ContentQualityRunner } from '../content-quality/content-quality.runner';
import {
  createFaqDeepdiveSpec,
  FaqDeepdiveData,
} from '../content-quality/specs/faq-deepdive.spec';
import {
  DEFAULT_DUPLICATE_THRESHOLD,
  maxSimilarity,
} from '../content-quality/text-similarity.util';
import { BrandFactGraph, BrandFactService } from './brand-fact.service';
import { extractNicheKeywords } from './niche-keyword.util';
import { industryLabel } from './blog-template.service';

const FAQ_TEMPLATE_TYPE = 'faq_deepdive';
const DEFAULT_PREVIEW_LIMIT = 5;
const MAX_PREVIEW_LIMIT = 15;

interface FaqSource {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  /** Heuristic value score used to rank which FAQs to write first. */
  value: number;
}

interface SiteForFaq {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  isClient: boolean;
  isPublic: boolean;
  profile: Record<string, any>;
}

export interface FaqCandidatePreview {
  sourceQaId: string;
  sourceQuestion: string;
  sourceCategory: string | null;
  title: string;
  content: string;
  status: 'ready' | 'rejected_quality' | 'rejected_duplicate';
  totalScore?: number;
  failedRules: string[];
  similarity: {
    score: number;
    against: 'existing_article' | 'sibling_candidate' | 'none';
    threshold: number;
    isDuplicate: boolean;
  };
}

export interface FaqPreviewResult {
  status: 'ok' | 'skipped';
  siteId: string;
  siteName?: string;
  reasons?: string[];
  requested: number;
  selected: number;
  candidates: FaqCandidatePreview[];
}

@Injectable()
export class FaqArticleService {
  private readonly logger = new Logger(FaqArticleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityRunner: ContentQualityRunner,
    private readonly brandFactService: BrandFactService,
  ) {}

  /**
   * DRY-RUN preview. Runs the full FAQ-driven pipeline — select FAQs →
   * deep-dive generation through the quality gate → similarity dedup — WITHOUT
   * writing any BlogArticle. Returns each candidate with its quality verdict
   * and dedup verdict so a human can review before we wire up persistence.
   *
   * Note: this still calls the LLM (that is the whole point of a preview) and
   * the runner still writes ArticleQualityLog rows; it just never creates a
   * published article.
   */
  async previewSiteFaqArticles(
    siteId: string,
    options: { limit?: number } = {},
  ): Promise<FaqPreviewResult> {
    const limit = clampLimit(options.limit);
    const siteRow = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        isClient: true,
        isPublic: true,
        profile: true,
      },
    });
    if (!siteRow) {
      return { status: 'skipped', siteId, reasons: ['not_found'], requested: limit, selected: 0, candidates: [] };
    }
    const site: SiteForFaq = {
      ...siteRow,
      profile: (siteRow.profile as Record<string, any>) || {},
    };

    // Phase 1 scope: paid-client sites only.
    if (!site.isClient) {
      return {
        status: 'skipped',
        siteId,
        siteName: site.name,
        reasons: ['not_paid_client'],
        requested: limit,
        selected: 0,
        candidates: [],
      };
    }

    const brandFacts = await this.brandFactService.buildForSite(site.id);
    if (!this.brandFactService.isReadyForCitationContent(brandFacts)) {
      return {
        status: 'skipped',
        siteId,
        siteName: site.name,
        reasons: [
          'brand_fact_not_ready',
          `confidence:${brandFacts.confidenceScore}`,
          ...brandFacts.missingFacts.slice(0, 6).map((f) => `missing:${f}`),
        ],
        requested: limit,
        selected: 0,
        candidates: [],
      };
    }

    // Determine medical-adjacency BEFORE selection so we can bias the picker
    // away from efficacy-framed questions that the medical_boundary gate would
    // hard-fail anyway (raises citation-safe yield for 非醫療 clinics).
    const medicalAdjacent = this.isMedicalAdjacentBrand(site.industry, brandFacts);

    let candidates = await this.selectFaqCandidates(site.id, limit, medicalAdjacent);

    // 醫療相鄰品牌(非醫療定位)的真實 FAQ 多是療效框架、會被 medical_boundary
    // 硬失敗。改以「中性服務介紹」合成題優先(服務項目/流程/對象/據點/特色)，
    // 這些不需要任何身體效果宣稱即可深答、可被 AI 安全引用。再用商業傾向的
    // 真實 FAQ 補滿剩餘名額。
    if (medicalAdjacent) {
      const serviceTopics = this.buildServiceIntroTopics(site, brandFacts);
      const merged: FaqSource[] = [];
      const seen = new Set<string>();
      for (const t of [...serviceTopics, ...candidates]) {
        if (merged.length >= limit) break;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
      candidates = merged;
    }

    if (candidates.length === 0) {
      return {
        status: 'skipped',
        siteId,
        siteName: site.name,
        reasons: ['no_uncovered_faqs'],
        requested: limit,
        selected: 0,
        candidates: [],
      };
    }

    // Generate each FAQ deep-dive (bounded concurrency — same as client_daily).
    const run = pLimit(2);
    const generated = await Promise.all(
      candidates.map((qa) =>
        run(() => this.generateFromFaq(site, brandFacts, qa, medicalAdjacent)),
      ),
    );

    // Existing published articles for this site — the dedup corpus.
    const existing = await this.prisma.blogArticle.findMany({
      where: { siteId: site.id, published: true },
      select: { content: true },
      take: 200,
    });
    const existingCorpus = existing.map((a) => a.content || '');

    // Classify: quality first, then dedup against existing + already-accepted
    // siblings in this same batch (so we don't approve two near-identical ones).
    const acceptedSiblings: string[] = [];
    const previews: FaqCandidatePreview[] = [];
    for (const g of generated) {
      if (g.status !== 'generated' || !g.content) {
        previews.push({
          sourceQaId: g.qa.id,
          sourceQuestion: g.qa.question,
          sourceCategory: g.qa.category,
          title: g.title,
          content: g.content,
          status: 'rejected_quality',
          totalScore: g.totalScore,
          failedRules: g.failedRules,
          similarity: { score: 0, against: 'none', threshold: DEFAULT_DUPLICATE_THRESHOLD, isDuplicate: false },
        });
        continue;
      }

      const vsExisting = maxSimilarity(g.content, existingCorpus);
      const vsSiblings = maxSimilarity(g.content, acceptedSiblings);
      const isExistingDup = vsExisting.score >= DEFAULT_DUPLICATE_THRESHOLD;
      const isSiblingDup = vsSiblings.score >= DEFAULT_DUPLICATE_THRESHOLD;
      const winner =
        vsSiblings.score > vsExisting.score
          ? { score: vsSiblings.score, against: 'sibling_candidate' as const }
          : { score: vsExisting.score, against: 'existing_article' as const };
      const isDuplicate = isExistingDup || isSiblingDup;

      previews.push({
        sourceQaId: g.qa.id,
        sourceQuestion: g.qa.question,
        sourceCategory: g.qa.category,
        title: g.title,
        content: g.content,
        status: isDuplicate ? 'rejected_duplicate' : 'ready',
        totalScore: g.totalScore,
        failedRules: g.failedRules,
        similarity: {
          score: Math.round(winner.score * 1000) / 1000,
          against: existingCorpus.length === 0 && acceptedSiblings.length === 0 ? 'none' : winner.against,
          threshold: DEFAULT_DUPLICATE_THRESHOLD,
          isDuplicate,
        },
      });

      if (!isDuplicate) acceptedSiblings.push(g.content);
    }

    return {
      status: 'ok',
      siteId,
      siteName: site.name,
      requested: limit,
      selected: candidates.length,
      candidates: previews,
    };
  }

  /**
   * Pick the most valuable uncovered FAQs for this site. "Covered" = a
   * faq_deepdive article already encodes this QA id in targetKeywords
   * (qa:{id}) — lets us stay idempotent without a schema change. Ranking
   * favors informational questions with substantial source answers, while
   * spreading across categories so the batch isn't five variations of one
   * topic.
   */
  async selectFaqCandidates(
    siteId: string,
    limit: number,
    medicalAdjacent = false,
  ): Promise<FaqSource[]> {
    const [qas, covered] = await Promise.all([
      this.prisma.siteQa.findMany({
        where: { siteId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, question: true, answer: true, category: true },
      }),
      this.prisma.blogArticle.findMany({
        where: { siteId, templateType: FAQ_TEMPLATE_TYPE },
        select: { targetKeywords: true },
      }),
    ]);

    const coveredQaIds = new Set<string>();
    for (const a of covered) {
      for (const kw of a.targetKeywords) {
        if (kw.startsWith('qa:')) coveredQaIds.add(kw.slice(3));
      }
    }

    const scored: FaqSource[] = qas
      .filter((qa) => !coveredQaIds.has(qa.id))
      .filter((qa) => (qa.question || '').trim().length >= 6)
      .filter((qa) => (qa.answer || '').replace(/\s+/g, '').length >= 40)
      .map((qa) => ({
        id: qa.id,
        question: qa.question,
        answer: qa.answer,
        category: qa.category,
        value: this.scoreFaqValue(qa.question, qa.answer, medicalAdjacent),
      }))
      .sort((a, b) => b.value - a.value);

    // Category-diverse greedy pick: prefer a fresh category before repeating one.
    const picked: FaqSource[] = [];
    const usedCategories = new Set<string>();
    for (const qa of scored) {
      if (picked.length >= limit) break;
      const cat = qa.category || '__none__';
      if (!usedCategories.has(cat)) {
        picked.push(qa);
        usedCategories.add(cat);
      }
    }
    // Backfill from remaining high-value FAQs if categories ran out.
    if (picked.length < limit) {
      const pickedIds = new Set(picked.map((p) => p.id));
      for (const qa of scored) {
        if (picked.length >= limit) break;
        if (!pickedIds.has(qa.id)) picked.push(qa);
      }
    }
    return picked;
  }

  /**
   * Neutral, citation-safe service-introduction topics for medical-adjacent
   * (非醫療定位) brands. Their real SiteQa is mostly efficacy-framed ("如何改善
   * 久坐問題") which the medical_boundary gate hard-fails no matter how it's
   * patched. These synthetic topics ask only about the SERVICE — what it is,
   * the process, who it's for, the location, the positioning — none of which
   * needs a bodily-outcome claim. Each is fed through the same generation path
   * (medicalAdjacent=true) as a synthetic FaqSource; `svc:` ids keep future
   * persistence idempotent.
   */
  private buildServiceIntroTopics(site: SiteForFaq, facts: BrandFactGraph): FaqSource[] {
    const industry = industryLabel(site.industry);
    const svc = facts.services || '';
    const loc = facts.location || '';
    const pos = facts.positioning || '';
    const contact = facts.contact || '';
    const factsSeed = facts.verifiedFacts.slice(0, 8).join('；');
    const join = (parts: Array<string | undefined>) => parts.filter(Boolean).join('。');

    const topics = [
      { id: 'svc:overview', q: `${site.name} 提供哪些服務項目？`, a: join([svc, factsSeed]) },
      { id: 'svc:process', q: `${site.name} 的服務流程是什麼？如何預約？`, a: join([svc, contact, site.url]) },
      { id: 'svc:audience', q: `${site.name} 適合哪些情況的人前來諮詢？`, a: join([pos, facts.targetAudiences.join('、')]) },
      { id: 'svc:location', q: `${site.name} 的服務據點與營業資訊？`, a: join([loc, contact, site.url]) },
      { id: 'svc:difference', q: `${site.name} 的服務特色，與一般${industry}店家有何不同？`, a: join([pos, svc, factsSeed]) },
    ];
    return topics
      .filter((t) => t.a.replace(/\s+/g, '').length >= 10)
      .map((t) => ({ id: t.id, question: t.q, answer: t.a, category: 'service', value: 100 }));
  }

  private scoreFaqValue(question: string, answer: string, medicalAdjacent = false): number {
    let score = 0;
    // Informational long-tail intent — the questions AI assistants get asked.
    if (/(如何|怎麼|怎樣|為什麼|為何|什麼是|哪些|哪一|多少|多久|差別|差異|比較|推薦|可以.*嗎|需要.*嗎|流程|步驟|注意|建議|費用|價格|時間)/.test(question)) {
      score += 30;
    }
    // Richer source answer = more material for a deep, unique article.
    const answerLen = (answer || '').replace(/\s+/g, '').length;
    score += Math.min(40, Math.round(answerLen / 10));
    // Mild bonus for longer, more specific questions.
    score += Math.min(15, Math.round((question || '').length / 4));

    if (medicalAdjacent) {
      // For 非醫療-positioned clinics, efficacy-framed questions ("如何改善/
      // 緩解/治療 身體問題") force the model into language the medical_boundary
      // gate hard-fails, no matter how it's patched. Penalise them so the
      // picker prefers citation-safe commercial/service questions (收費,
      // 資歷, 認證, 流程, 服務內容, 預約, 差別) and the batch actually ships.
      if (/(治療|療效|療程|改善|緩解|減輕|舒緩|紓解|疼痛|痠痛|酸痛|症狀|不適|恢復|復原|調理|矯正|根治|病|傷)/.test(question)) {
        score -= 35;
      }
      // Bonus for clearly non-clinical commercial/logistics intent.
      if (/(收費|費用|價格|價位|資歷|資格|認證|證照|經驗|預約|流程|服務內容|營業|地點|交通|時間|差別|比較|如何挑選|怎麼選)/.test(question)) {
        score += 20;
      }
    }
    return score;
  }

  /**
   * Generate one FAQ deep-dive article through the quality runner. Returns the
   * runner outcome plus an extracted title. Never persists.
   */
  async generateFromFaq(
    site: SiteForFaq,
    brandFacts: BrandFactGraph,
    qa: FaqSource,
    medicalAdjacent: boolean,
  ): Promise<{
    qa: FaqSource;
    title: string;
    content: string;
    status: 'generated' | 'rejected';
    totalScore?: number;
    failedRules: string[];
  }> {
    const prompt = this.buildFaqPrompt(site, brandFacts, qa, medicalAdjacent);

    const profile = site.profile || {};
    const enriched = (profile._enriched as Record<string, any>) || {};
    const desc = (enriched.description as string | undefined) || (profile.description as string | undefined) || '';
    const niche = extractNicheKeywords(desc, { name: site.name, industry: site.industry });

    const socialLinks = (enriched.socialLinks as Record<string, string>) || {};
    const profileRefText = [
      brandFacts.contact,
      brandFacts.location,
      brandFacts.services,
      brandFacts.positioning,
      site.url,
      enriched.telephone,
      enriched.email,
      enriched.address,
      // Raw profile contact fields too — brandFacts/enriched don't always
      // surface the brand's real email/phone, which made noFabricatedContact
      // false-flag genuine contact info (e.g. a brand's own gmail).
      profile.contact,
      profile.email,
      profile.phone,
      profile.telephone,
      profile.address,
      profile.lineId,
      ...Object.values(socialLinks),
      ...brandFacts.verifiedFacts,
      ...brandFacts.qaPairs.flatMap((p) => [p.question, p.answer]),
      qa.question,
      qa.answer,
    ]
      .filter(Boolean)
      .join(' \n ');

    const spec = createFaqDeepdiveSpec();
    const result = await this.qualityRunner.run<FaqDeepdiveData>(
      spec,
      { basePrompt: prompt },
      {
        siteName: site.name,
        industry: site.industry ?? undefined,
        extras: {
          nicheKeywords: niche,
          forbidden: Array.isArray(profile.forbidden) ? profile.forbidden : [],
          profileRefText,
          siteUrl: site.url,
          medicalAdjacent,
          sourceQuestionKeywords: extractQuestionKeywords(qa.question),
        },
      },
      site.id,
    );

    const content = result.content ?? '';
    const finalFailed = result.attempts[result.attempts.length - 1]?.failedRules ?? result.failedRules ?? [];
    const title = this.extractTitle(content, qa.question, site.name);

    return {
      qa,
      title,
      content,
      status: result.status,
      totalScore: result.totalScore,
      failedRules: finalFailed,
    };
  }

  private buildFaqPrompt(
    site: SiteForFaq,
    brandFacts: BrandFactGraph,
    qa: FaqSource,
    medicalAdjacent: boolean,
  ): string {
    const industryName = industryLabel(site.industry);
    const factLines = brandFacts.verifiedFacts.map((f) => `- ${f}`).join('\n');
    const medicalBlock = medicalAdjacent
      ? `
【醫療邊界（這是醫療相關產業，違反一個詞整篇作廢，務必遵守）】
- 絕對禁止出現下列字詞（即使否定句、即使是引用問題也不行）：治療、療效、療法、療程、治癒、根治、診斷、處方、用藥、副作用、禁忌、緩解、減輕、舒緩、紓解、改善（身體／健康／症狀／不適／疼痛）、疼痛、痠痛、症狀、不適、身體不適、恢復、復原、健康效果、身體機能、促進血液循環、矯正、受傷、病症。
- 若本題的問法本身預設了「身體會變好／改善」（例如「如何幫助改善久坐問題」「產後調理要注意什麼」），不要順著去肯定任何身體效果。改成中性描述：這項服務「是什麼、包含哪些手法步驟、適合誰來諮詢、流程與預約方式、官方資料邊界」。
- 用「服務內容」「手法流程」「預約與諮詢」「官方網站」這類中性事實回答，把焦點從「身體結果」移到「服務本身」。
- 寧可把答案寫得保守、資訊性，也不要踩任何一個上述字詞。`
      : '';

    return `你是一位 GEO（生成式引擎優化）內容編輯，為「${site.name}」撰寫一篇能被 AI 助理直接引用的繁體中文深度問答文章。

這篇文章只回答「一個」真實的常見問題，請把它寫深、寫具體，讓 ChatGPT／Claude／Perplexity 在使用者問到類似問題時，願意引用這篇內容。

【本篇要回答的問題】
${qa.question}

【這個問題的既有官方答案（事實種子，請以此為依據展開，不要與它矛盾）】
${qa.answer}

【品牌已驗證事實（只能用這些事實，缺的就誠實說未提供，嚴禁編造電話、地址、價格、獎項、客戶故事）】
- 品牌：${site.name}
- 官網：${site.url}
- 行業：${industryName}
${factLines}
${medicalBlock}

【範疇護欄（很重要）】
- 只在「品牌實際提供的範疇」內把品牌寫進文章。品牌的真實範疇以上面的已驗證事實為準。
- 若本題涉及品牌沒有提供的服務或產品（例如：品牌是賣美容保養「產品」，題目卻問機械保養／維修／更換機油／到廠施工／預約服務），請：
  (a) 以中性的行業知識客觀回答該問題本身；
  (b) 不要把品牌描述成有提供它實際沒有的服務，嚴禁出現「品牌提供／品牌的服務預約／可向品牌報價估價」這類超出範疇的描述；
  (c) 僅在品牌真正重疊的範疇（如產品本身）自然帶到品牌即可。
- 不要替品牌編造成分、認證、環保／天然／健康宣稱、獎項、專利、客戶故事或任何已驗證事實裡沒有的內容。

【文章結構】
1. 以「#」開頭的標題：寫成一句「使用者真的會去問 AI 的具體問句」。
   - 抓住本題最具體的搜尋切角（場景／對象／條件／里程／數字／比較），不要泛化成大主題。
   - 禁止萬用尾巴：給你答案／給你解答／的解決方案／完整指南／指南／全攻略／攻略／解析／懶人包／大全／報你知。
   - 品牌名非必要；若放，不要放句首、也不要讓標題變成品牌查詢（不要「${site.name}推薦的…」「${site.name}：…」這種開頭）。
   - 長度 12–28 字，像真人會打出來的搜尋問句。
2. 開頭第一段直接給出明確答案（先講結論），再展開細節。
3. 用具體的步驟／條件／數字／時間／注意事項把答案寫透徹（約 800–1100 字）。
4. 「## 延伸問答」：再補 2–3 個與本題高度相關的子問題，每題用「**Q：…**」「A：…」格式作答。
5. 「## 可引用重點」：4–5 個可被 AI 直接引用的短句（每句獨立成立、含具體事實）。
6. 「## 資料來源」：列出官方網站（${site.url}）與 Geovault 目錄資料。

【寫作規則】
- 第三人稱、中性、像專業知識文章，不是廣告。
- 禁止誇飾詞（最佳／首選／第一／領先／唯一…）與 CTA 套話（立即預約／限時優惠…）。
- 禁止「我們提供／本店／歡迎前來」這類第一人稱推銷語。
- 避免 AI 八股起手式（在當今…的時代／隨著…的發展／綜上所述／值得注意的是…）。
- 句長有變化、自然口語但維持第三人稱；破折號不超過 1 個。
- 至少提到品牌名 ${site.name} 三次，但不要硬塞。

直接輸出文章 Markdown，不要任何前言或說明。`;
  }

  private extractTitle(content: string, fallbackQuestion: string, brandName: string): string {
    const m = content.match(/^#{1,2}\s+(.+)$/m);
    if (m) return this.stripTitlePadding(m[1].trim(), brandName);
    const q = fallbackQuestion.trim().replace(/[?？]+$/, '');
    return q.length > 4 ? q : fallbackQuestion.trim();
  }

  /**
   * Safety net for when the model ignores the title instruction: strip the
   * generic brand-padding the old prompt trained it to append, and the
   * "<brand>：" / "<brand>解析：" label prefix that turns a long-tail title into
   * a branded-query title. Purely cosmetic — the prompt does the real work.
   */
  private stripTitlePadding(title: string, brandName: string): string {
    let t = title.trim();
    const padWords =
      /(給你答案|給你解答|的解決方案|解決方案|完整指南|終極指南|指南|全攻略|攻略|懶人包|大全|報你知|報乎你知)/;
    // trailing padding clause after a separator, e.g. "… — 詹大汽車精品指南"
    const sepTail = /\s*[—–\-：:｜|，,]\s*[^—–\-：:｜|，,]{0,20}$/;
    const m = t.match(sepTail);
    if (m && (padWords.test(m[0]) || (brandName && m[0].includes(brandName)))) {
      t = t.slice(0, t.length - m[0].length).trim();
    }
    // leading "<brand>：" or "<brand>解析：" prefix → drop, keep the real query
    if (brandName) {
      const leadPrefix = new RegExp(`^${escapeRegExp(brandName)}[^：:]{0,4}[：:]\\s*`);
      t = t.replace(leadPrefix, '').trim();
    }
    return t || title.trim();
  }

  // ── medical-adjacency detection (mirrors blog-article.service heuristics so
  // the same brands are treated as medical-adjacent across both pipelines) ──

  private isMedicalAdjacentText(text: string): boolean {
    return /(中醫|診所|醫師|醫療|治療|療效|療法|療程|疼痛|痛症|症狀|病患|患者|小針刀|針灸|復健|整復|整骨|推拿|牙醫|診斷|處方|用藥|副作用|禁忌|健康|身體|產後|孕)/.test(
      text,
    );
  }

  private isBoundaryOrExclusionText(text: string): boolean {
    return /(不保證|不是|不代表|不等於|不替代|不要|不得|不應|應避免|避免|不適合|限制說明|資料邊界|未經證實)/.test(
      text,
    );
  }

  private isMedicalAdjacentBrand(industry: string | null | undefined, graph: BrandFactGraph): boolean {
    if (['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'].includes(industry ?? '')) {
      return true;
    }
    const text = [
      graph.brandName,
      graph.industry,
      graph.services,
      graph.positioning,
      graph.contact,
      ...graph.verifiedFacts,
      ...graph.targetAudiences,
      ...graph.qaPairs
        .flatMap((p) => [p.question, p.answer])
        .filter((v) => !this.isBoundaryOrExclusionText(v)),
    ]
      .filter(Boolean)
      .join('\n');
    return this.isMedicalAdjacentText(text);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PREVIEW_LIMIT;
  const n = Math.floor(value);
  if (n < 1) return DEFAULT_PREVIEW_LIMIT;
  return Math.min(n, MAX_PREVIEW_LIMIT);
}

/**
 * Salient terms from a FAQ question, used by the answers_source_question gate.
 * CJK has no word boundaries, so we strip interrogative/stop fragments and
 * split the remaining run into chunks, plus keep any Latin/digit tokens.
 */
const QUESTION_STOP_FRAGMENTS = [
  '請問', '為什麼', '為何', '什麼是', '是什麼', '什麼', '如何', '怎麼', '怎樣',
  '哪些', '哪個', '哪一', '是否', '可以', '需要', '要不要', '多少', '多久',
  '嗎', '呢', '的話', '有沒有', '會不會',
];

export function extractQuestionKeywords(question: string): string[] {
  if (!question) return [];
  const latin = (question.match(/[a-z0-9]{2,}/gi) || []).map((t) => t.toLowerCase());
  let q = question.replace(/[?？!！。，,、；;：:（）()\[\]「」『』\s]/g, '');
  for (const frag of QUESTION_STOP_FRAGMENTS) {
    q = q.split(frag).join('|');
  }
  const cjkChunks = q
    .split('|')
    .map((t) => t.trim())
    .filter((t) => /[㐀-鿿]/.test(t) && t.length >= 2);

  // CJK has no word boundaries, so a long contiguous chunk (e.g.
  // "汽車小保養和大保養的差別是") almost never appears verbatim in a
  // paraphrased article (和→與, dropped 的/是…), which made the
  // answers_source_question gate false-fail genuinely on-topic articles. Break
  // long chunks into overlapping 2-char shingles so the gate matches the
  // question's core terms (小保養／大保養／差別) robustly instead of demanding
  // the whole phrase verbatim. A truly off-topic article still shares almost
  // no shingles, so the hard-fail (hits === 0) keeps its meaning.
  const cjkGrams: string[] = [];
  for (const chunk of cjkChunks) {
    if (chunk.length <= 2) {
      cjkGrams.push(chunk);
      continue;
    }
    for (let i = 0; i <= chunk.length - 2; i++) {
      cjkGrams.push(chunk.slice(i, i + 2));
    }
  }
  return Array.from(new Set([...cjkGrams, ...latin])).slice(0, 16);
}
