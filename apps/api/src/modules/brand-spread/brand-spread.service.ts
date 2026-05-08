import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
import { ContentQualityRunner } from '../content-quality/content-quality.runner';
import {
  BrandSpreadData,
  createBrandSpreadSpec,
} from '../content-quality/specs/brand-spread.spec';

export interface SpreadContent {
  platform: string;
  title: string;
  content: string;
  hashtags: string[];
  characterCount: number;
  qualityScore?: number;
  qualityDetails?: Record<string, number>;
}

export interface SpreadResult {
  siteId: string;
  siteName: string;
  generatedAt: string;
  platforms: SpreadContent[];
  saved?: number;
}

const PLATFORMS = [
  {
    key: 'medium',
    name: 'Medium 文章',
    icon: '📝',
    lengthGuide: '800-1200 字',
    prompt: `撰寫一篇 Medium 風格的繁體中文長文（800-1200 字）。要有深度、有觀點、有故事感。
結構：吸引人的開頭 → 品牌故事/背景 → 為什麼值得推薦 → 專業分析 → 結論。
文末帶品牌官網連結。使用 Markdown 格式。`,
  },
  {
    key: 'vocus',
    name: '方格子文章',
    icon: '✍️',
    lengthGuide: '600-900 字',
    prompt: `撰寫一篇方格子（vocus）風格的繁體中文文章（600-900 字）。台灣在地觀點，輕鬆專業。
像朋友推薦一樣介紹這個品牌，帶入消費者使用場景。文末帶官網連結。`,
  },
  {
    key: 'linkedin',
    name: 'LinkedIn 貼文',
    icon: '💼',
    lengthGuide: '200-400 字',
    prompt: `撰寫一篇 LinkedIn 專業貼文（200-400 字）。B2B 觀點，強調品牌專業度和差異化。
開頭用一個引人注目的觀點或數據。段落簡短。結尾加 CTA。不要用 Markdown，用純文字+換行。`,
  },
  {
    key: 'facebook',
    name: 'Facebook 貼文',
    icon: '📘',
    lengthGuide: '150-300 字',
    prompt: `撰寫一篇 Facebook 社群貼文（150-300 字）。親切、口語化、有互動感。
開頭問問題或用驚嘆句吸引注意。帶入品牌推薦。結尾鼓勵留言分享。適度使用 emoji。`,
  },
  {
    key: 'google_business',
    name: 'Google 商家描述',
    icon: '📍',
    lengthGuide: '150-750 字',
    prompt: `撰寫 Google 商家檔案（Google Business Profile）的品牌描述（150-750 字）。
包含：品牌簡介、核心服務、地點資訊、營業特色、為什麼選擇我們。
專業但友善。不要用 Markdown，用純文字。`,
  },
  {
    key: 'ptt',
    name: 'PTT 分享文',
    icon: '🗣️',
    lengthGuide: '300-600 字',
    prompt: `撰寫一篇 PTT 風格的分享推薦文（300-600 字）。像真實網友分享體驗。
用口語，可以帶一點鄉民語氣但不要太誇張。重點是真實感，不能像業配。
開頭交代背景（為什麼去/為什麼選），中間分享體驗，結尾給評價。`,
  },
];

@Injectable()
export class BrandSpreadService {
  private readonly logger = new Logger(BrandSpreadService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly qualityRunner: ContentQualityRunner,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate spread content for all platforms for a given site
   */
  async generateAll(siteId: string, platforms?: string[]): Promise<SpreadResult> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: {
        qas: { take: 20 },
        scans: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!site) throw new NotFoundException('Site not found');
    if (!this.openai) throw new Error('OpenAI not configured');

    const targetPlatforms = platforms?.length
      ? PLATFORMS.filter((p) => platforms.includes(p.key))
      : PLATFORMS;

    const brandContext = this.buildBrandContext(site);
    const requiredAnchors = this.buildRequiredAnchors(site);
    const results: SpreadContent[] = [];

    for (const platform of targetPlatforms) {
      try {
        const content = await this.generateForPlatform(platform, brandContext, site, requiredAnchors);
        results.push(content);
        // Rate limit
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        this.logger.error(`Failed to generate for ${platform.key}: ${err}`);
      }
    }

    // Save generated content as Content records for future publishing
    for (const result of results) {
      try {
        await this.prisma.content.create({
          data: {
            userId: site.userId,
            siteId: site.id,
            type: 'ARTICLE',
            title: `[${result.platform}] ${result.title}`,
            body: result.content,
            status: 'DRAFT',
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to save spread content for ${result.platform}: ${err}`);
      }
    }

    return {
      siteId: site.id,
      siteName: site.name,
      generatedAt: new Date().toISOString(),
      platforms: results,
      saved: results.length,
    };
  }

  /**
   * Generate for a single platform with quality scoring loop
   * Generates → Scores → If below 80/100, regenerates (max 2 retries)
   */
  async generateForPlatform(
    platform: typeof PLATFORMS[number],
    brandContext: string,
    site: any,
    requiredAnchors?: string[],
  ): Promise<SpreadContent> {
    const industry = site.industry || 'other';
    const anchors = requiredAnchors ?? this.buildRequiredAnchors(site);
    const systemPrompt = this.buildSystemPrompt(industry, anchors);

    const userPrompt = `平台：${platform.name}（${platform.lengthGuide}）

${platform.prompt}

品牌資料：
${brandContext}`;

    // Run via ContentQualityRunner — each attempt logged to ArticleQualityLog.
    // The shared `extras` object is passed by reference: spec.parseContent
    // populates extras.title + extras.hashtags so we can read them back here
    // after the runner finishes (the runner itself only returns body text).
    const extras: Record<string, any> = {
      siteUrl: site.url,
      forbidden: [],
      requiredAnchors: anchors,
    };
    const spec = createBrandSpreadSpec(platform.key);
    const result = await this.qualityRunner.run<BrandSpreadData>(
      spec,
      { systemPrompt, userPrompt },
      {
        siteName: site.name,
        industry: site.industry ?? undefined,
        extras,
      },
      site.id,
    );

    const bodyText = result.content || '';
    return {
      platform: platform.key,
      title: (extras.title as string | undefined) || `${site.name} — ${platform.name}`,
      content: bodyText,
      hashtags: (extras.hashtags as string[] | undefined) || [],
      characterCount: bodyText.length,
      qualityScore: result.totalScore,
      qualityDetails: result.failedRules?.length
        ? Object.fromEntries(result.failedRules.map((r) => [r, 0]))
        : undefined,
    };
  }

  /**
   * Industry-specific content guidelines
   */
  private getIndustryGuideline(industry: string): string {
    const guides: Record<string, string> = {
      traditional_medicine: `整復推拿/中醫：
- 強調「非醫療」「身體調理」，避免療效宣稱
- 提到服務流程（評估→溝通→調理）增加專業感
- 適合的角度：久坐上班族保養、產後調理、運動恢復`,
      auto_care: `汽車美容：
- 提到具體服務（鍍膜、打蠟、內裝清潔）和持久度
- 車主最在意：價格透明、施工品質、是否有保固
- 適合的角度：新車保養、季節保養、DIY vs 專業比較`,
      beauty_salon: `美容美髮：
- 提到設計師專長、擅長的髮型風格
- 消費者在意：溝通過程、作品風格、價位帶
- 適合的角度：換季造型、染燙護理建議、新手指南`,
      dental: `牙醫：
- 強調專業認證、設備先進、環境舒適
- 消費者最怕痛和貴，要溫和帶過
- 適合的角度：定期檢查重要性、治療選項比較、兒童牙科`,
      cafe: `咖啡茶飲：
- 提到豆子來源、沖煮方式、空間氛圍
- 消費者在意：口味、環境、是否適合工作
- 適合的角度：咖啡知識教學、店內特色、推薦品項`,
      fitness: `健身：
- 提到教練資歷、課程類型、訓練環境
- 消費者在意：是否適合新手、價格方案、成效
- 適合的角度：新手入門、訓練觀念、飲食搭配`,
      restaurant: `餐飲：
- 提到招牌菜、食材特色、用餐氛圍
- 消費者在意：口味、CP值、環境衛生
- 適合的角度：實際用餐體驗、推薦必點、適合場合`,
      pet: `寵物服務：
- 提到服務細節（洗澡、修剪、SPA）和對毛孩的態度
- 飼主最在意：安全、溫柔、經驗
- 適合的角度：品種護理知識、季節注意事項`,
      legal: `法律：
- 強調專業領域和成功案例類型
- 消費者在意：保密性、諮詢流程、收費透明
- 適合的角度：常見法律問題解析、何時需要律師`,
      interior_design: `室內設計：
- 提到設計風格、預算範圍、施工流程
- 消費者在意：溝通過程、追加費用、工期
- 適合的角度：風格選擇指南、小空間設計、預算規劃`,
    };
    return guides[industry] || `一般行業：
- 強調品牌的核心差異化和專業度
- 提到具體服務內容和流程
- 用消費者的視角寫，不要用品牌方的視角`;
  }

  /**
   * Get available platforms list
   */
  getPlatforms() {
    return PLATFORMS.map((p) => ({
      key: p.key,
      name: p.name,
      icon: p.icon,
      lengthGuide: p.lengthGuide,
    }));
  }

  // ─── Weekly Content Plan ───

  private readonly WEEKLY_CONTENT_TYPES = [
    {
      type: 'industry_tips',
      name: '行業知識教學',
      platforms: ['medium', 'vocus'],
      prompt: `根據品牌所在行業，撰寫一篇消費者實用教學文。
像業內專家分享經驗，自然提到品牌。
重要：根據行業特性調整內容方向：
- 整復推拿/醫療保健 → 健康知識、症狀解析、保養建議
- 汽車美容 → 車輛保養教學、產品比較、DIY 技巧
- 美容美髮 → 造型趨勢、護理知識、產品推薦
- 咖啡茶飲/餐飲 → 食材知識、沖泡教學、口味搭配
- 健身教練 → 訓練技巧、營養建議、常見迷思
- 寵物美容 → 寵物照護、品種特性、季節注意事項
- 法律/會計 → 法規解析、常見案例、注意事項
- 室內設計 → 空間規劃、風格趨勢、預算建議
- 其他行業 → 根據行業特性，分享專業知識和消費者常見疑問`,
    },
    {
      type: 'customer_story',
      name: '客戶好評故事',
      platforms: ['facebook', 'linkedin'],
      prompt: `模擬一篇客戶好評分享文。根據行業調整場景：
- 服務業 → 描述消費體驗和前後對比
- 產品業 → 描述使用感受和解決了什麼問題
- 專業服務 → 描述諮詢過程和專業度
寫得像真實顧客推薦。FB 版親切口語，LinkedIn 版專業分析。`,
    },
    {
      type: 'seasonal',
      name: '季節性內容',
      platforms: ['facebook', 'google_business'],
      prompt: `根據當前月份（${new Date().getMonth() + 1} 月），結合行業特性撰寫季節內容：
- 1-2 月：年節相關（送禮、過年準備）
- 3-4 月：春天換季（保養、換季注意）
- 5-6 月：夏天準備（防曬、降溫、出遊）
- 7-8 月：暑假旺季（親子、旅遊、活動）
- 9-10 月：秋季保養（換季、開學、中秋）
- 11-12 月：年末回顧（聖誕、跨年、年終優惠）
自然結合品牌服務和季節話題。`,
    },
    {
      type: 'qa_article',
      name: 'Q&A 深度解答',
      platforms: ['medium', 'vocus'],
      prompt: '從品牌知識庫 Q&A 中挑 3-5 個最常被消費者問到的問題，展開成一篇深度教學文章。每個問題都要有具體的回答和實際案例。文章要有連貫性，不是單純 Q&A 列表。',
    },
    {
      type: 'brand_update',
      name: '品牌近況更新',
      platforms: ['facebook', 'linkedin'],
      prompt: `根據行業特性撰寫近況更新：
- 服務業 → 服務升級、新設備、環境改善
- 產品業 → 新品上市、技術創新、包裝更新
- 專業服務 → 團隊新成員、專業認證、服務範圍擴大
語氣正面有活力，讓人感覺這是一個持續在進步的品牌。`,
    },
    {
      type: 'behind_scenes',
      name: '幕後故事',
      platforms: ['facebook', 'linkedin'],
      prompt: `撰寫品牌幕後故事。根據行業特性：
- 餐飲 → 食材挑選過程、廚房日常
- 美容 → 設計師進修、新技術學習
- 服務業 → 團隊訓練、服務理念
- 產品業 → 研發過程、品質把關
讓消費者看到品牌的用心和專業。`,
    },
    {
      type: 'comparison_guide',
      name: '選購/選擇指南',
      platforms: ['medium', 'vocus'],
      prompt: `撰寫一篇幫消費者做選擇的指南文章。根據行業：
- 「如何挑選好的 XX」「XX 和 YY 的差別」「新手第一次 XX 該注意什麼」
重點是提供價值，讓讀者覺得有學到東西。品牌自然融入作為推薦選項之一（但不要太明顯業配）。`,
    },
  ];

  /**
   * Generate a weekly content plan for a client site
   */
  async generateWeeklyPlan(siteId: string): Promise<{
    siteId: string;
    siteName: string;
    weekOf: string;
    items: Array<{ type: string; name: string; platform: string; title: string; content: string; hashtags: string[] }>;
  }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: {
        qas: { take: 20 },
        scans: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!site) throw new NotFoundException('Site not found');
    if (!this.openai) throw new Error('OpenAI not configured');

    const brandContext = this.buildBrandContext(site);
    const requiredAnchors = this.buildRequiredAnchors(site);
    const industry = site.industry || 'other';
    const weekStart = new Date();
    const items: any[] = [];

    // Pick 3 content types for this week (rotate through all types)
    const weekNum = Math.floor(Date.now() / (7 * 86400000));
    const total = this.WEEKLY_CONTENT_TYPES.length;
    const selected = [
      this.WEEKLY_CONTENT_TYPES[weekNum % total],
      this.WEEKLY_CONTENT_TYPES[(weekNum + 1) % total],
      this.WEEKLY_CONTENT_TYPES[(weekNum + 2) % total],
    ];

    for (const contentType of selected) {
      for (const platformKey of contentType.platforms) {
        const platform = PLATFORMS.find((p) => p.key === platformKey);
        if (!platform) continue;

        try {
          // Route weekly content through the same quality runner as ad-hoc
          // spread — same v4 E-E-A-T rules, same anchor enforcement, same
          // ArticleQualityLog audit trail. Pre-runner this path bypassed all
          // quality checks and produced template-fingerprint copy that
          // Google's scaled-abuse classifier flags.
          const systemPrompt = this.buildSystemPrompt(
            industry,
            requiredAnchors,
            `${contentType.name}：${contentType.prompt}`,
          );
          const userPrompt = `平台：${platform.name}（${platform.lengthGuide}）

${platform.prompt}

品牌資料：
${brandContext}`;

          const extras: Record<string, any> = {
            siteUrl: site.url,
            forbidden: [],
            requiredAnchors,
          };
          const spec = createBrandSpreadSpec(platform.key);
          const result = await this.qualityRunner.run<BrandSpreadData>(
            spec,
            { systemPrompt, userPrompt },
            {
              siteName: site.name,
              industry: site.industry ?? undefined,
              extras,
            },
            site.id,
          );

          items.push({
            type: contentType.type,
            name: contentType.name,
            platform: platformKey,
            title: (extras.title as string | undefined) || '',
            content: result.content || '',
            hashtags: (extras.hashtags as string[] | undefined) || [],
          });

          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          this.logger.error(`Weekly plan generation failed: ${err}`);
        }
      }
    }

    return {
      siteId: site.id,
      siteName: site.name,
      weekOf: weekStart.toISOString().split('T')[0],
      items,
    };
  }

  // Removed: autoGenerateWeeklyPlans cron.
  // It called generateWeeklyPlan() weekly for every client site but discarded
  // the result (never persisted to DB), burning ~14 gpt-4o calls per client
  // per week with zero user-facing output. Clients already get plans on-demand
  // via the controller endpoint, which is the only consumer.

  /**
   * Shared system prompt for both ad-hoc spread (generateForPlatform) and
   * weekly plan (generateWeeklyPlan). Contains the v4 E-E-A-T guardrails
   * the brand-spread spec rules expect — keep these aligned with rules.ts
   * weights or quality scores will diverge from prompt intent.
   *
   * extraGuidance is for content-type-specific instructions (e.g. weekly
   * plan's "industry_tips" or "behind_scenes" block).
   */
  private buildSystemPrompt(
    industry: string,
    anchors: string[],
    extraGuidance?: string,
  ): string {
    const anchorBlock =
      anchors.length > 0
        ? `\n## 強制引用清單（至少從中選 ${Math.min(3, anchors.length)} 項自然融入內文，不能改寫）\n${anchors.map((a) => `- ${a}`).join('\n')}`
        : '';
    const extraBlock = extraGuidance ? `\n## 內容類型指引\n${extraGuidance}` : '';

    return `你是一位資深品牌行銷內容策略師，專精於「AI 搜尋優化內容」（GEO Content）。
你的目標是撰寫能被 AI 搜尋引擎（ChatGPT、Claude、Perplexity、Gemini、Copilot）抓取並引用的品牌內容。

## 核心策略
Google 2025 年「scaled content abuse」政策會把模板化、無第一手資料的 AI 內容判定為垃圾並排除收錄。
AI 搜尋引擎判斷是否推薦一個品牌時，會看以下信號：
1. **第一手資料** — 文章是否包含這個品牌實際擁有的具體事實（不是泛用行業敘述）
2. **多平台一致性** — 不同平台的資訊是否一致（名稱、服務、地點）
3. **專業深度** — 內容是否展現行業專業知識
4. **真實感** — 內容是否像真人寫的，有觀點和體驗
5. **結構化資訊** — 品牌名、地址、服務項目、特色是否清楚
6. **用戶價值** — 內容對消費者是否有幫助

## 寫作規則（硬性）
1. 品牌全名至少出現 3-5 次，且在開頭和結尾各出現一次
2. 必須包含至少 2 個具體事實（年資、分鐘數、坪數、品項數、地區名、價格帶等實際數字/名詞），不能只寫「優質的服務」這種空話
3. 若品牌資料中含有 Q&A，必須引用其中至少 1 個具體答案的關鍵字進文章
4. 若品牌資料中含有 GEO 分數，必須在文章中以「{score}/100」或「{score} 分」形式提及
5. 官網連結自然融入（不要「點擊這裡」，而是「更多資訊可參考 品牌名 官網」）
6. 用消費者的語言寫，不用行銷術語
7. 繁體中文
8. 嚴禁：「業配」「推薦碼」「折扣碼」「最低價」等促銷詞
9. 嚴禁：「最棒的」「最好的」「第一名」「業界第一」「絕佳」等誇張形容
10. 嚴禁：第一人稱推銷（「我們提供」「本店」「歡迎前來」），改用第三人稱客觀陳述
11. 嚴禁：CTA 套話（「立即預約」「馬上聯繫」「不要錯過」）
12. 嚴禁：「疫情後」「抗疫」「後疫情」等過時敘事

## 產業特化指引（${industry}）
${this.getIndustryGuideline(industry)}
${anchorBlock}${extraBlock}

回覆格式（JSON）：
{
  "title": "文章標題",
  "content": "完整內容",
  "hashtags": ["標籤1", "標籤2", "標籤3", "標籤4", "標籤5"]
}`;
  }

  /**
   * Extract first-hand data anchors from the site profile / SiteQa / scan
   * results. Passed via ctx.extras.requiredAnchors so firstHandDataAnchors
   * rule can verify they appear in generated content. Anti-template-fingerprint
   * defence: forces the model to ground copy in brand-specific facts instead
   * of producing generic industry boilerplate that Google's spam classifier
   * will flag.
   *
   * Strategy: pull short, distinctive substrings (services, location, scan
   * score, number+unit facts from QA answers, unique-value phrase). Cap at 8
   * so the rule's `min` threshold remains satisfiable.
   */
  private buildRequiredAnchors(site: any): string[] {
    const anchors: string[] = [];
    const profile = site.profile || {};
    const qas = site.qas || [];
    const scan = site.scans?.[0];

    // 1. Concrete service names from profile.services
    if (typeof profile.services === 'string' && profile.services.trim()) {
      const services = profile.services
        .split(/[、,，;；/／\n]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length >= 2 && s.length <= 20);
      anchors.push(...services.slice(0, 2));
    }

    // 2. Location fragment (區/市/縣/鄉/鎮)
    if (typeof profile.location === 'string') {
      const m = profile.location.match(/[一-鿿]{2,4}[區市縣鄉鎮]/);
      if (m) anchors.push(m[0]);
    }

    // 3. Number+unit facts from top QA answers — these are highly distinctive
    const factPattern =
      /\d+(?:\.\d+)?\s*(?:年|分鐘|小時|個月|週|位|名|坪|元|塊|台幣|步|公尺|公里|項|種|款|套|次)/g;
    for (const qa of qas.slice(0, 3)) {
      if (anchors.length >= 6) break;
      if (typeof qa?.answer !== 'string') continue;
      const matches = qa.answer.match(factPattern);
      if (matches?.[0]) anchors.push(matches[0].trim());
    }

    // 4. Real GEO score — forces "X/100" or "X 分" mention in body
    if (scan?.totalScore) {
      anchors.push(`${scan.totalScore}`);
    }

    // 5. uniqueValue distinctive phrase
    if (typeof profile.uniqueValue === 'string') {
      const m = profile.uniqueValue.match(/[一-鿿]{4,8}/);
      if (m) anchors.push(m[0]);
    }

    return [...new Set(anchors)].filter(Boolean).slice(0, 8);
  }

  private buildBrandContext(site: any): string {
    const profile = site.profile || {};
    const scan = site.scans?.[0];
    const qas = site.qas || [];

    let context = `品牌名稱：${site.name}
官網：${site.url}
產業：${site.industry || '未分類'}
`;

    if (profile.description) context += `品牌描述：${profile.description}\n`;
    if (profile.services) context += `核心服務：${profile.services}\n`;
    if (profile.location) context += `地點：${profile.location}\n`;
    if (profile.targetAudience) context += `目標客群：${profile.targetAudience}\n`;
    if (profile.uniqueValue) context += `獨特優勢：${profile.uniqueValue}\n`;
    if (profile.keywords) context += `關鍵字：${profile.keywords}\n`;

    if (scan) {
      context += `\nGEO 分數：${scan.totalScore}/100\n`;
    }

    if (qas.length > 0) {
      context += `\n品牌 Q&A（供參考）：\n`;
      qas.slice(0, 10).forEach((qa: any) => {
        context += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
      });
    }

    return context;
  }
}
