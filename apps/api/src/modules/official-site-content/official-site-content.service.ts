import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSiteAccess } from '../../common/auth/site-access';
import { BrandFactGraph, BrandFactService } from '../blog-article/brand-fact.service';
import { markdownToPortableHtml } from '../blog-article/article-publish-package.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import {
  DEFAULT_DUPLICATE_THRESHOLD,
  maxSimilarity,
} from '../content-quality/text-similarity.util';
import { GenerateOfficialArticleDto, VerifyOfficialArticleDto } from './dto';

const DEFAULT_MODEL = 'gpt-4o';
const MIN_ARTICLE_CHARS = 900;
const MAX_ARTICLE_CHARS = 8000;
const SOURCE_ARTICLE_LIMIT = 30;
const OFFICIAL_ARTICLE_STATUSES = ['draft', 'approved', 'export_ready'] as const;

interface SourceArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  targetKeywords: string[];
  createdAt: Date;
}

export interface OfficialArticleRecommendation {
  topic: string;
  angle: string;
  suggestedSlug: string;
  publishBaseUrl: string;
  canonicalUrl: string;
  reasoning: string;
  sourceArticleId?: string;
  sourceArticle?: Pick<SourceArticle, 'id' | 'slug' | 'title' | 'description' | 'targetKeywords'>;
  firstPartyReadiness: {
    ready: boolean;
    confidenceScore: number;
    missingFacts: string[];
  };
  dataUsed: {
    verifiedFacts: number;
    qaPairs: number;
    recentPlatformTopics: number;
    existingOfficialArticles: number;
  };
}

interface GenerationBrief {
  topic: string;
  angle: string;
  canonicalUrl: string;
}

interface GeneratedPayload {
  title: string;
  content: string;
  metaDescription?: string;
  keywords?: string[];
  faq?: Array<{ question: string; answer: string }>;
}

interface QualityReport {
  passed: boolean;
  checks: Record<string, boolean>;
  charLength: number;
  similarityScore: number;
  similarityThreshold: number;
  matchedArticleId: string | null;
  failedReasons: string[];
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?(?:\[([^\]]+)\]\([^)]*\))/g, '$1')
    .replace(/[#>*_`~\-|=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseJsonResponse(raw: string): GeneratedPayload {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new BadRequestException('AI 回傳格式無法解析，請重新生成');
  }

  const record = parsed && typeof parsed === 'object'
    ? parsed as Record<string, unknown>
    : {};
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  const metaDescription = typeof record.metaDescription === 'string'
    ? record.metaDescription.trim()
    : undefined;
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : undefined;
  const faq = Array.isArray(record.faq)
    ? record.faq
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        question: typeof item.question === 'string' ? item.question.trim() : '',
        answer: typeof item.answer === 'string' ? item.answer.trim() : '',
      }))
      .filter((item) => item.question.length >= 5 && item.answer.length >= 20)
      .slice(0, 6)
    : undefined;

  if (!title || !content) {
    throw new BadRequestException('AI 回傳缺少文章標題或正文，請重新生成');
  }
  return { title, content, metaDescription, keywords, faq };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class OfficialSiteContentService {
  private readonly logger = new Logger(OfficialSiteContentService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly brandFactService: BrandFactService,
    private readonly indexNow: IndexNowService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private async assertAccess(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, userId: true, name: true, url: true, industry: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async list(siteId: string, userId: string, role?: string) {
    await this.assertAccess(siteId, userId, role);
    return this.prisma.officialSiteArticle.findMany({
      where: { siteId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        targetQuestion: true,
        targetKeywords: true,
        publishBaseUrl: true,
        canonicalUrl: true,
        similarityScore: true,
        qualityReport: true,
        rejectionReason: true,
        publishedUrl: true,
        generatedAt: true,
        approvedAt: true,
        lastVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Build a reviewable plan from data the customer has already supplied. */
  async recommend(siteId: string, userId: string, role?: string): Promise<OfficialArticleRecommendation> {
    const site = await this.assertAccess(siteId, userId, role);
    const graph = await this.brandFactService.buildForSite(siteId);
    return this.buildRecommendation(site, graph);
  }

  private async buildRecommendation(
    site: { id: string; name: string; url: string; industry: string | null },
    graph: BrandFactGraph,
  ): Promise<OfficialArticleRecommendation> {
    const [sources, existing] = await Promise.all([
      this.prisma.blogArticle.findMany({
        where: { siteId: site.id, published: true, templateType: 'client_daily' },
        orderBy: { createdAt: 'desc' },
        take: SOURCE_ARTICLE_LIMIT,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          targetKeywords: true,
          createdAt: true,
        },
      }),
      this.prisma.officialSiteArticle.findMany({
        where: { siteId: site.id, status: { not: 'archived' } },
        select: { title: true, targetQuestion: true, publishBaseUrl: true },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
    ]);

    const existingTopics = new Set(
      existing
        .flatMap((article) => [article.title, article.targetQuestion])
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeText(value)),
    );
    const qaTopic = graph.qaPairs
      .map((pair) => pair.question.trim())
      .find((question) => question.length >= 8 && !existingTopics.has(normalizeText(question)));
    const topic = qaTopic || `${site.name}${site.industry ? ` ${site.industry}` : ''}服務與適用對象指南`;
    const angle = `以${graph.services || site.industry || '官方服務'}、適用對象、實際流程與常見疑問回答讀者，僅使用已確認的第一方資料。`;
    const suggestedSlug = this.buildSuggestedSlug(site.id, topic);
    const publishBaseUrl = existing.find((article) => article.publishBaseUrl)?.publishBaseUrl
      || this.defaultPublishBaseUrl(site.url);
    const canonicalUrl = this.buildCanonicalFromBase(publishBaseUrl, suggestedSlug);
    const source = sources.find((item) => Boolean(item.title && item.description));

    return {
      topic,
      angle,
      suggestedSlug,
      publishBaseUrl,
      canonicalUrl,
      reasoning: source
        ? `系統讀取了品牌資料、${graph.qaPairs.length} 組 FAQ，以及近期平台主題「${source.title}」作為方向參考；文章正文仍會重新以官網第一方資料生成。`
        : `系統讀取了品牌資料與 ${graph.qaPairs.length} 組 FAQ，先挑選尚未使用的客戶問題作為文章方向。`,
      sourceArticleId: source?.id,
      sourceArticle: source
        ? {
            id: source.id,
            slug: source.slug,
            title: source.title,
            description: source.description,
            targetKeywords: source.targetKeywords,
          }
        : undefined,
      firstPartyReadiness: {
        ready: this.brandFactService.isReadyForCitationContent(graph),
        confidenceScore: graph.confidenceScore,
        missingFacts: graph.missingFacts,
      },
      dataUsed: {
        verifiedFacts: graph.verifiedFacts.length,
        qaPairs: graph.qaPairs.length,
        recentPlatformTopics: sources.length,
        existingOfficialArticles: existing.length,
      },
    };
  }

  async findOne(id: string, siteId: string, userId: string, role?: string) {
    await this.assertAccess(siteId, userId, role);
    const article = await this.prisma.officialSiteArticle.findFirst({
      where: { id, siteId },
      include: {
        site: { select: { id: true, name: true, url: true, industry: true } },
        sourceArticle: {
          select: { id: true, slug: true, title: true, description: true, createdAt: true },
        },
      },
    });
    if (!article) throw new NotFoundException('Official-site article not found');
    return article;
  }

  async listSources(siteId: string, userId: string, role?: string) {
    await this.assertAccess(siteId, userId, role);
    const sources = await this.prisma.blogArticle.findMany({
      where: { siteId, published: true, templateType: 'client_daily' },
      orderBy: { createdAt: 'desc' },
      take: SOURCE_ARTICLE_LIMIT,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        targetKeywords: true,
        createdAt: true,
      },
    });
    const webUrl = this.config.get<string>('FRONTEND_URL') || 'https://www.geovault.app';
    return sources.map((source) => ({
      ...source,
      platformUrl: `${webUrl}/blog/${source.slug}`,
    }));
  }

  async generate(
    siteId: string,
    dto: GenerateOfficialArticleDto,
    userId: string,
    role?: string,
  ) {
    const site = await this.assertAccess(siteId, userId, role);
    if (!this.openai) {
      throw new BadRequestException('目前尚未設定 OPENAI_API_KEY，無法生成官網專屬文章');
    }

    const graph = await this.brandFactService.buildForSite(siteId);
    if (!this.brandFactService.isReadyForCitationContent(graph)) {
      throw new BadRequestException({
        code: 'FIRST_PARTY_DATA_NOT_READY',
        message: '官網第一方資料尚未完整，請先補齊品牌資料與知識庫 Q&A',
        confidenceScore: graph.confidenceScore,
        missingFacts: graph.missingFacts,
      });
    }

    const recommendation = await this.buildRecommendation(site, graph);
    const topic = dto.topic?.trim() || recommendation.topic;
    const angle = dto.angle?.trim() || recommendation.angle;
    const sourceArticleId = dto.sourceArticleId || recommendation.sourceArticleId;
    const source = sourceArticleId
      ? await this.getSourceArticle(siteId, sourceArticleId)
      : null;
    const publishBaseUrl = this.normalizePublishBaseUrl(
      site.url,
      dto.publishBaseUrl || (dto.canonicalUrl ? this.getUrlBase(dto.canonicalUrl) : recommendation.publishBaseUrl),
    );
    const suggestedSlug = this.normalizeSlug(
      dto.slug || (dto.canonicalUrl ? this.getSlugFromUrl(dto.canonicalUrl) : recommendation.suggestedSlug),
    );
    const slug = await this.ensureUniqueSlug(siteId, suggestedSlug);
    const canonicalUrl = dto.canonicalUrl
      ? this.normalizeCanonicalUrl(site.url, dto.canonicalUrl)
      : this.buildCanonicalFromBase(publishBaseUrl, slug);
    const firstPartySnapshot = this.buildFirstPartySnapshot(graph);
    const prompt = this.buildPrompt(site, { topic, angle, canonicalUrl }, source, firstPartySnapshot);

    const response = await this.openai.chat.completions.create({
      model: this.config.get<string>('OFFICIAL_SITE_ARTICLE_AI_MODEL') || DEFAULT_MODEL,
      temperature: 0.65,
      max_tokens: 6500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是繁體中文官網內容編輯。你必須只使用客戶第一方資料，不得捏造服務、地點、聯絡方式或成效。這篇文章要和任何第三方平台文章保持明顯不同。',
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content || '';
    const generated = parseJsonResponse(raw);
    const content = generated.content.trim();
    const description = cleanMarkdown(generated.metaDescription || content).slice(0, 180);
    const quality = await this.runQualityChecks(siteId, site.name, content);
    const status = quality.passed ? 'draft' : 'quality_failed';
    const articleSchema = this.buildArticleSchema({
      title: generated.title,
      description,
      canonicalUrl,
      siteName: site.name,
      siteUrl: site.url,
    });
    const faqSchema = this.buildFaqSchema(generated.faq || []);
    const targetKeywords = [...new Set([
      topic,
      ...(generated.keywords || []),
      ...(site.industry ? [site.industry] : []),
    ].map((item) => item.trim()).filter(Boolean))].slice(0, 12);

    const created = await this.prisma.officialSiteArticle.create({
      data: {
        siteId,
        userId,
        sourceArticleId: source?.id,
        slug,
        title: generated.title.slice(0, 240),
        description,
        content,
        status,
        targetQuestion: topic,
        targetKeywords,
        publishBaseUrl,
        canonicalUrl,
        metaTitle: generated.title.slice(0, 180),
        metaDescription: description,
        articleSchema: asJson(articleSchema),
        faqSchema: faqSchema ? asJson(faqSchema) : undefined,
        firstPartySnapshot: asJson(firstPartySnapshot),
        qualityReport: asJson(quality),
        similarityScore: quality.similarityScore,
        similarityMatchedArticleId: quality.matchedArticleId,
        rejectionReason: quality.failedReasons.length > 0 ? quality.failedReasons.join('; ') : null,
        generatedAt: new Date(),
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        targetQuestion: true,
        targetKeywords: true,
        publishBaseUrl: true,
        canonicalUrl: true,
        similarityScore: true,
        qualityReport: true,
        rejectionReason: true,
        generatedAt: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `Official-site article ${created.id} generated for ${siteId}: status=${status}, similarity=${quality.similarityScore.toFixed(3)}`,
    );
    return created;
  }

  async approve(id: string, siteId: string, userId: string, role?: string) {
    await this.assertAccess(siteId, userId, role);
    const article = await this.prisma.officialSiteArticle.findFirst({ where: { id, siteId } });
    if (!article) throw new NotFoundException('Official-site article not found');
    if (article.status !== 'draft') {
      throw new BadRequestException('只有通過品質檢查的草稿可以核准');
    }
    const report = article.qualityReport as QualityReport | null;
    if (!report?.passed) {
      throw new BadRequestException('文章尚未通過內容與相似度檢查，不能提供官網內容包');
    }
    if (!article.canonicalUrl) {
      throw new BadRequestException('請先設定客戶官網文章網址');
    }
    return this.prisma.officialSiteArticle.update({
      where: { id: article.id },
      data: { status: 'export_ready', approvedAt: new Date() },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        canonicalUrl: true,
        similarityScore: true,
        approvedAt: true,
        updatedAt: true,
      },
    });
  }

  async getPublishPackage(id: string, siteId: string, userId: string, role?: string) {
    const article = await this.findOne(id, siteId, userId, role);
    if (article.status !== 'export_ready') {
      throw new BadRequestException('文章必須先通過審核，才可取得官網內容包');
    }
    if (!article.canonicalUrl) {
      throw new BadRequestException('官網內容包缺少 canonical URL');
    }

    const articleSchema = (article.articleSchema || {}) as Record<string, unknown>;
    const faqSchema = article.faqSchema as Record<string, unknown> | null;
    const graph = [
      { '@type': 'Article', ...articleSchema },
      ...(faqSchema ? [{ '@type': 'FAQPage', ...faqSchema }] : []),
    ];
    const jsonLdText = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
    const cmsHtml = markdownToPortableHtml(article.content);
    const metaTags = [
      `<title>${this.escapeHtml(article.metaTitle || article.title)}</title>`,
      `<meta name="description" content="${this.escapeHtml(article.metaDescription || article.description)}">`,
      `<link rel="canonical" href="${this.escapeHtml(article.canonicalUrl)}">`,
    ].join('\n');
    const packageResult = {
      officialSite: {
        name: article.site.name,
        url: article.site.url,
        publishBaseUrl: article.publishBaseUrl,
        canonicalUrl: article.canonicalUrl,
      },
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        description: article.description,
        status: article.status,
        targetKeywords: article.targetKeywords,
      },
      formats: {
        markdown: article.content,
        cmsHtml,
        jsonLd: jsonLdText,
        jsonLdScript: `<script type="application/ld+json">\n${jsonLdText}\n</script>`,
        metaTags,
      },
      files: [
        { name: `${article.slug}.md`, purpose: '官網文章 Markdown', content: article.content },
        { name: `${article.slug}.html`, purpose: 'CMS HTML 內容', content: cmsHtml },
        { name: `${article.slug}.jsonld`, purpose: 'Article 與 FAQ 結構化資料', content: jsonLdText },
      ],
      crawlerGuidance: {
        requiresBackendSourceEdit: false,
        explanation: '客戶不需要修改後端程式碼；請透過 CMS 文章欄位、SEO 欄位與自訂結構化資料區塊完成上架。',
      },
    };
    await this.prisma.officialSiteArticle.update({
      where: { id: article.id },
      data: { exportedAt: new Date() },
    });
    return packageResult;
  }

  async verify(
    id: string,
    siteId: string,
    dto: VerifyOfficialArticleDto,
    userId: string,
    role?: string,
  ) {
    const article = await this.findOne(id, siteId, userId, role);
    if (article.status !== 'export_ready') {
      throw new BadRequestException('文章必須先核准並取得官網內容包，才能驗證正式網址');
    }
    const verifiedUrl = this.normalizeCanonicalUrl(article.site.url, dto.url);
    const checks: Record<string, boolean> = {
      reachable: false,
      canonical: false,
      articleSchema: false,
      visibleContent: false,
      indexable: false,
      openGraph: false,
      faqSchema: !article.faqSchema,
    };
    let statusCode: number | null = null;
    let finalUrl: string | null = null;
    let error: string | null = null;

    try {
      const response = await fetch(verifiedUrl, {
        headers: { 'User-Agent': 'Geovault-OfficialContentVerifier/1.0 (+https://www.geovault.app/bot)' },
        signal: AbortSignal.timeout(15000),
      });
      statusCode = response.status;
      finalUrl = response.url;
      const html = await response.text();
      const normalizedHtml = html.replace(/\s+/g, ' ');
      const text = this.stripHtml(html);
      const expectedText = cleanMarkdown(article.content).slice(0, 80);
      checks.reachable = response.ok;
      checks.canonical = this.findCanonical(normalizedHtml) === verifiedUrl;
      checks.articleSchema = /application\/ld\+json[\s\S]*?"@type"\s*:\s*"Article"/i.test(html);
      checks.visibleContent = expectedText.length >= 24 && normalizeText(text).includes(normalizeText(expectedText));
      checks.indexable = !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
      checks.openGraph = /<meta[^>]+property=["']og:title["']/i.test(html);
      checks.faqSchema = !article.faqSchema || /application\/ld\+json[\s\S]*?"@type"\s*:\s*"FAQPage"/i.test(html);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const requiredPassed = checks.reachable && checks.canonical && checks.articleSchema && checks.visibleContent && checks.indexable;
    const verificationReport = {
      passed: requiredPassed,
      checkedUrl: verifiedUrl,
      statusCode,
      finalUrl,
      checks,
      error,
      checkedAt: new Date().toISOString(),
    };
    const updated = await this.prisma.officialSiteArticle.update({
      where: { id: article.id },
      data: {
        publishedUrl: verifiedUrl,
        lastVerifiedAt: new Date(),
        verificationReport: asJson(verificationReport),
      },
      select: {
        id: true,
        status: true,
        publishedUrl: true,
        lastVerifiedAt: true,
        verificationReport: true,
      },
    });

    if (requiredPassed) {
      this.indexNow.submitUrl(verifiedUrl).catch((err) => {
        this.logger.warn(`Official-site IndexNow ping failed for ${verifiedUrl}: ${err}`);
      });
    }
    return updated;
  }

  private async getSourceArticle(siteId: string, id: string): Promise<SourceArticle> {
    const source = await this.prisma.blogArticle.findFirst({
      where: { id, siteId, published: true, templateType: 'client_daily' },
      select: { id: true, slug: true, title: true, description: true, targetKeywords: true, createdAt: true },
    });
    if (!source) throw new NotFoundException('Platform source article not found');
    return source;
  }

  private buildFirstPartySnapshot(graph: BrandFactGraph) {
    return {
      brandName: graph.brandName,
      industry: graph.industry,
      officialUrl: graph.url,
      location: graph.location || null,
      services: graph.services || null,
      targetAudiences: graph.targetAudiences,
      notFor: graph.notFor,
      positioning: graph.positioning || null,
      contact: graph.contact || null,
      socialLinks: graph.socialLinks,
      qaPairs: graph.qaPairs.slice(0, 12),
      confidenceScore: graph.confidenceScore,
    };
  }

  private buildPrompt(
    site: { name: string; url: string; industry: string | null },
    brief: GenerationBrief,
    source: SourceArticle | null,
    firstPartySnapshot: ReturnType<OfficialSiteContentService['buildFirstPartySnapshot']>,
  ) {
    return `請重新生成一篇「客戶官方網站專屬」繁體中文文章，不是把 Geovault 平台文章換句話說。

硬性規則：
1. 只能使用下方客戶第一方資料，不能捏造不存在的服務、地址、電話、價格、成效或客戶案例。
2. 不要提及 Geovault、client_daily、平台文章、發布包、平台分數或第三方平台。
3. 不要引用或重現任何平台文章正文；平台資料只用來決定主題方向。
4. 文章要以客戶官網讀者的實際問題為中心，加入客戶自己的服務情境、適用對象與限制。
5. 產出 900–1400 字繁體中文，使用 Markdown 標題與段落，FAQ 至少 3 題。

客戶網站：${site.name}
官方網域：${site.url}
行業：${site.industry || '未分類'}
文章主題：${brief.topic}
內容角度：${brief.angle || '以官方服務與讀者決策需求為中心'}
預計 canonical URL：${brief.canonicalUrl}

平台文章僅提供以下「主題靈感 metadata」，不可使用其正文：
${source ? JSON.stringify({ title: source.title, description: source.description, keywords: source.targetKeywords }, null, 2) : '(沒有指定平台文章，請依主題重新規劃)'}

客戶第一方資料：
${JSON.stringify(firstPartySnapshot, null, 2)}

請只回傳 JSON object，不要 Markdown code fence：
{
  "title": "官網文章標題",
  "content": "完整 Markdown 正文，第一行使用 # 標題",
  "metaDescription": "150 字以內的官網摘要",
  "keywords": ["3-8 個官網關鍵字"],
  "faq": [
    { "question": "問題", "answer": "只根據第一方資料回答" }
  ]
}`;
  }

  private async runQualityChecks(siteId: string, siteName: string, content: string): Promise<QualityReport> {
    const plain = cleanMarkdown(content);
    const platformCorpus = await this.prisma.blogArticle.findMany({
      where: { siteId, published: true },
      select: { id: true, content: true },
    });
    const officialCorpus = await this.prisma.officialSiteArticle.findMany({
      where: { siteId, status: { in: [...OFFICIAL_ARTICLE_STATUSES] } },
      select: { id: true, content: true },
    });
    const corpus = [
      ...platformCorpus.map((item) => ({ id: item.id, content: item.content })),
      ...officialCorpus.map((item) => ({ id: item.id, content: item.content })),
    ];
    const similarity = maxSimilarity(content, corpus.map((item) => item.content));
    const matchedArticleId = similarity.matchedIndex >= 0 ? corpus[similarity.matchedIndex]?.id || null : null;
    const failedReasons: string[] = [];
    const checks: Record<string, boolean> = {
      minimumLength: plain.length >= MIN_ARTICLE_CHARS,
      maximumLength: plain.length <= MAX_ARTICLE_CHARS,
      hasHeading: /^#\s+.+/m.test(content),
      includesBrandName: normalizeText(plain).includes(normalizeText(siteName)),
      noPlaceholders: !/(?:TODO|TBD|XXX|\[待補|\{.*?\})/i.test(content),
      noPlatformReferences: !/(?:Geovault|client_daily|平台文章|發布包)/i.test(content),
      belowDuplicateThreshold: similarity.score < DEFAULT_DUPLICATE_THRESHOLD,
    };
    for (const [key, passed] of Object.entries(checks)) {
      if (!passed) failedReasons.push(key);
    }
    return {
      passed: failedReasons.length === 0,
      checks,
      charLength: plain.length,
      similarityScore: similarity.score,
      similarityThreshold: DEFAULT_DUPLICATE_THRESHOLD,
      matchedArticleId,
      failedReasons,
    };
  }

  private buildArticleSchema(input: {
    title: string;
    description: string;
    canonicalUrl: string;
    siteName: string;
    siteUrl: string;
  }) {
    return {
      headline: input.title,
      description: input.description,
      url: input.canonicalUrl,
      mainEntityOfPage: input.canonicalUrl,
      author: { '@type': 'Organization', name: input.siteName, url: input.siteUrl },
      publisher: { '@type': 'Organization', name: input.siteName, url: input.siteUrl },
      inLanguage: 'zh-TW',
      dateModified: new Date().toISOString(),
    };
  }

  private buildFaqSchema(faqs: Array<{ question: string; answer: string }>) {
    if (faqs.length === 0) return null;
    return {
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    };
  }

  private buildSuggestedSlug(siteId: string, title: string): string {
    const titlePart = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'article';
    return `${titlePart}-${siteId.slice(0, 8)}`;
  }

  private normalizeSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
    if (!slug || !/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]*$/i.test(slug)) {
      throw new BadRequestException('slug 只能包含英數字、中文與連字號');
    }
    return slug;
  }

  private async ensureUniqueSlug(siteId: string, requestedSlug: string): Promise<string> {
    const base = this.normalizeSlug(requestedSlug);
    let candidate = base;
    for (let suffix = 1; suffix <= 20; suffix += 1) {
      const existing = await this.prisma.officialSiteArticle.findFirst({
        where: { siteId, slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${base}-${suffix + 1}`.slice(0, 100);
    }
    return `${base}-${Date.now().toString(36)}`.slice(0, 100);
  }

  private defaultPublishBaseUrl(siteUrl: string): string {
    try {
      const url = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
      return `${url.origin}/blog`;
    } catch {
      throw new BadRequestException('客戶官網網址無效，無法建立發布位置');
    }
  }

  private getUrlBase(candidate: string): string {
    try {
      const url = new URL(candidate);
      const segments = url.pathname.split('/').filter(Boolean);
      url.pathname = `/${segments.slice(0, -1).join('/')}` || '/';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return candidate;
    }
  }

  private getSlugFromUrl(candidate: string): string {
    try {
      const segments = new URL(candidate).pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || 'official-article';
    } catch {
      return 'official-article';
    }
  }

  private buildCanonicalFromBase(publishBaseUrl: string, slug: string): string {
    return `${publishBaseUrl.replace(/\/+$/, '')}/${slug}`;
  }

  private normalizePublishBaseUrl(siteUrl: string, candidate: string): string {
    const normalized = this.normalizeCanonicalUrl(siteUrl, candidate);
    const url = new URL(normalized);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  }

  private normalizeCanonicalUrl(siteUrl: string, candidate: string): string {
    let official: URL;
    let target: URL;
    try {
      official = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
      target = new URL(candidate);
    } catch {
      throw new BadRequestException('canonicalUrl 必須是有效的網址');
    }
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new BadRequestException('canonicalUrl 必須使用 http 或 https');
    }
    const officialHost = official.hostname.toLowerCase().replace(/^www\./, '');
    const targetHost = target.hostname.toLowerCase().replace(/^www\./, '');
    if (targetHost !== officialHost && !targetHost.endsWith(`.${officialHost}`)) {
      throw new BadRequestException('canonicalUrl 必須使用客戶官方網域');
    }
    target.hash = '';
    return target.toString();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findCanonical(html: string): string | null {
    const linkTags = html.match(/<link\b[^>]*>/gi) || [];
    for (const tag of linkTags) {
      if (!/\brel=["']canonical["']/i.test(tag)) continue;
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (href) return href.replace(/#.*$/, '');
    }
    return null;
  }
}
