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
const MAX_QUALITY_ATTEMPTS = 3;
const MIN_GEO_QUALITY_SCORE = 82;
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
    scanIndicators: number;
    reportAvailable: boolean;
  };
}

interface GenerationBrief {
  topic: string;
  angle: string;
  canonicalUrl: string;
  topicDirection?: string;
  qualityFeedback?: string;
  geoContext: GeoContext;
}

interface GeoIndicatorContext {
  indicator: string;
  score: number;
  status: string;
  suggestion: string | null;
}

interface GeoContext {
  latestScanScore: number | null;
  latestScanAt: Date | null;
  indicators: GeoIndicatorContext[];
  latestReportSummary: Record<string, unknown> | null;
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
  score: number;
  minimumScore: number;
  attempts?: number;
  finalAttempt?: number;
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
    const geoContext = await this.loadGeoContext(siteId);
    return this.buildRecommendation(site, graph, geoContext);
  }

  private async loadGeoContext(siteId: string): Promise<GeoContext> {
    const [latestScan, latestReport] = await Promise.all([
      this.prisma.scan.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: {
          totalScore: true,
          completedAt: true,
          results: {
            select: { indicator: true, score: true, status: true, suggestion: true },
          },
        },
      }),
      this.prisma.monitorReport.findFirst({
        where: { siteId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        select: { summary: true },
      }),
    ]);

    return {
      latestScanScore: latestScan?.totalScore ?? null,
      latestScanAt: latestScan?.completedAt ?? null,
      indicators: latestScan?.results ?? [],
      latestReportSummary: latestReport?.summary && typeof latestReport.summary === 'object'
        ? latestReport.summary as Record<string, unknown>
        : null,
    };
  }

  private async buildRecommendation(
    site: { id: string; name: string; url: string; industry: string | null },
    graph: BrandFactGraph,
    geoContext: GeoContext,
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
    const weakIndicator = geoContext.indicators.find((item) => item.status === 'fail' || item.status === 'warning');
    const topic = qaTopic || `${site.name}${site.industry ? ` ${site.industry}` : ''}服務與適用對象指南`;
    const scanDirection = weakIndicator?.suggestion
      ? `同時回應最新網站檢測的「${weakIndicator.indicator}」問題：${weakIndicator.suggestion}`
      : '以最新網站檢測結果確認文章中的品牌與服務敘述一致';
    const reportDirection = geoContext.latestReportSummary
      ? '並參考最新 AI 引用綜合報告的查詢表現，補足讀者最需要的直接答案'
      : '目前沒有可用的 AI 引用綜合報告，先以已確認的品牌資料與 FAQ 為主';
    const angle = `以${graph.services || site.industry || '官方服務'}、適用對象、實際流程與常見疑問回答讀者，${scanDirection}；${reportDirection}。僅使用已確認的第一方資料。`;
    const suggestedSlug = this.buildSuggestedSlug(topic);
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
        ? `系統讀取品牌資料、${graph.qaPairs.length} 組 FAQ、${geoContext.indicators.length} 項最新網站檢測，以及近期平台主題「${source.title}」；${geoContext.latestScanScore !== null ? `最新掃描 ${geoContext.latestScanScore}/100` : '尚無完成掃描'}。文章正文仍會重新以官網第一方資料生成。`
        : `系統讀取品牌資料、${graph.qaPairs.length} 組 FAQ 與 ${geoContext.indicators.length} 項網站檢測，先挑選尚未使用的客戶問題作為方向；${geoContext.latestScanScore !== null ? `最新掃描 ${geoContext.latestScanScore}/100` : '尚無完成掃描'}。`,
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
        scanIndicators: geoContext.indicators.length,
        reportAvailable: Boolean(geoContext.latestReportSummary),
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

    const geoContext = await this.loadGeoContext(siteId);
    const recommendation = await this.buildRecommendation(site, graph, geoContext);
    const topicDirection = dto.topicDirection?.trim() || undefined;
    const topic = topicDirection || dto.topic?.trim() || recommendation.topic;
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
    let generated: GeneratedPayload | null = null;
    let quality: QualityReport | null = null;
    let qualityFeedback = '';
    let finalAttempt = 0;

    for (let attempt = 1; attempt <= MAX_QUALITY_ATTEMPTS; attempt += 1) {
      finalAttempt = attempt;
      const prompt = this.buildPrompt(
        site,
        { topic, angle, canonicalUrl, topicDirection, qualityFeedback, geoContext },
        source,
        firstPartySnapshot,
      );
      try {
        const response = await this.openai.chat.completions.create({
          model: this.config.get<string>('OFFICIAL_SITE_ARTICLE_AI_MODEL') || DEFAULT_MODEL,
          temperature: attempt === 1 ? 0.65 : 0.45,
          max_tokens: 6500,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是專業 GEO 官網內容總編。目標是讓真實品牌更容易被 AI 收錄、引用、推薦與摘要。只使用客戶第一方資料，不得捏造服務、地點、聯絡方式、價格、成效或案例；每次輸出都必須依品質回饋修正。',
            },
            { role: 'user', content: prompt },
          ],
        });

        const raw = response.choices[0]?.message?.content || '';
        generated = parseJsonResponse(raw);
        quality = await this.runQualityChecks(siteId, site.name, generated.content, generated, graph, geoContext);
        quality.attempts = attempt;
        quality.finalAttempt = attempt;
        if (quality.passed) break;
        qualityFeedback = `上一版未達標，請重新改寫，不要只補字數：${quality.failedReasons.join('、')}。品質分數 ${quality.score}/${quality.minimumScore}。請優先改善直接回答、可引用的事實、清楚段落與 FAQ。`;
      } catch (error) {
        if (attempt === MAX_QUALITY_ATTEMPTS) throw error;
        qualityFeedback = `上一版生成格式失敗，請重新輸出完整 JSON，並確保正文與 FAQ 都是繁體中文且資料可由客戶第一方資料支持。`;
      }
    }

    if (!generated || !quality) {
      throw new BadRequestException('文章生成未完成，請更換主題方向後再試');
    }
    const content = generated.content.trim();
    const description = cleanMarkdown(generated.metaDescription || content).slice(0, 180);
    quality.attempts = quality.attempts || finalAttempt;
    quality.finalAttempt = quality.finalAttempt || finalAttempt;
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
      ...(topicDirection ? [topicDirection] : []),
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
        rejectionReason: quality.failedReasons.length > 0
          ? `${quality.failedReasons.join('; ')}${quality.passed ? '' : `；已自動優化 ${quality.finalAttempt || MAX_QUALITY_ATTEMPTS} 次仍未達標，建議換一個主題方向`}`
          : null,
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
客戶指定方向：${brief.topicDirection || '未指定，請依品牌資料與檢測結果判斷'}
內容角度：${brief.angle || '以官方服務與讀者決策需求為中心'}
預計 canonical URL：${brief.canonicalUrl}

GEO 內容目標：
- 文章必須先回答讀者問題，再補充背景與步驟，讓 AI 能直接擷取明確答案。
- 只使用可從客戶第一方資料驗證的品牌、服務、適用對象、限制與聯絡資訊。
- 使用清楚的 H2/H3、定義、條件、步驟與至少 3 組 FAQ，避免空泛行銷語。
- 不要提及 Geovault、平台文章、GEO 分數或第三方來源，也不要把檢測分數當成客戶成效宣稱。

最新網站掃描與 AI 引用檢測摘要（僅用於判斷內容重點，不可在文章中捏造或宣稱）：
${JSON.stringify(brief.geoContext, null, 2)}

${brief.qualityFeedback ? `上一輪品質回饋（本輪必須修正）：\n${brief.qualityFeedback}\n` : ''}

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

  private async runQualityChecks(
    siteId: string,
    siteName: string,
    content: string,
    generated: GeneratedPayload,
    graph: BrandFactGraph,
    geoContext: GeoContext,
  ): Promise<QualityReport> {
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
    const headingCount = (content.match(/^#{2,3}\s+.+/gm) || []).length;
    const hasGroundedEntity = [graph.services, graph.industry, graph.positioning, graph.location]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeText(plain).includes(normalizeText(value)));
    const hasScanAwareStructure = geoContext.indicators.length === 0
      || /(?:FAQ|常見問題|結構化|可讀|回答|步驟|描述|標題)/i.test(content);
    const checks: Record<string, boolean> = {
      minimumLength: plain.length >= MIN_ARTICLE_CHARS,
      maximumLength: plain.length <= MAX_ARTICLE_CHARS,
      hasHeading: /^#\s+.+/m.test(content),
      hasStructuredSections: headingCount >= 4,
      includesBrandName: normalizeText(plain).includes(normalizeText(siteName)),
      includesGroundedEntity: hasGroundedEntity,
      noPlaceholders: !/(?:TODO|TBD|XXX|\[待補|\{.*?\})/i.test(content),
      noPlatformReferences: !/(?:Geovault|client_daily|平台文章|發布包)/i.test(content),
      hasFaq: Boolean(generated.faq && generated.faq.length >= 3),
      hasActionableAnswer: /(?:結論|重點|步驟|建議|可以|應該|適合|不適合)/i.test(content),
      hasAiReadableStructure: /(?:常見問題|FAQ|問：|Q[:：])/i.test(content),
      isScanAware: hasScanAwareStructure,
      belowDuplicateThreshold: similarity.score < DEFAULT_DUPLICATE_THRESHOLD,
    };
    for (const [key, passed] of Object.entries(checks)) {
      if (!passed) failedReasons.push(key);
    }
    const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    return {
      passed: failedReasons.length === 0 && score >= MIN_GEO_QUALITY_SCORE,
      score,
      minimumScore: MIN_GEO_QUALITY_SCORE,
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

  private buildSuggestedSlug(title: string): string {
    const phraseMap: Array<[RegExp, string]> = [
      [/常見問題|常見問答|FAQ/gi, 'faq'],
      [/適用對象/g, 'target-audience'],
      [/提供什麼服務|提供哪些服務|服務內容/g, 'services'],
      [/服務/g, 'services'],
      [/企業/g, 'business'],
      [/軟體|軟件/g, 'software'],
      [/導入|導入流程/g, 'implementation'],
      [/流程/g, 'process'],
      [/指南|教學/g, 'guide'],
      [/如何/g, 'how-to'],
      [/比較/g, 'comparison'],
      [/選擇/g, 'selection'],
      [/推薦/g, 'recommendation'],
      [/價格|費用/g, 'pricing'],
      [/網站/g, 'website'],
      [/品牌/g, 'brand'],
    ];
    let value = title;
    for (const [pattern, replacement] of phraseMap) value = value.replace(pattern, ` ${replacement} `);
    const titlePart = value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .replace(/-+$/g, '');
    return titlePart || 'official-guide';
  }

  private normalizeSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
      throw new BadRequestException('slug 只能包含英文字母、數字與連字號');
    }
    return slug;
  }

  private async ensureUniqueSlug(siteId: string, requestedSlug: string): Promise<string> {
    const base = this.normalizeSlug(requestedSlug);
    const candidates = this.slugAlternatives(base);
    for (const candidate of candidates) {
      const existing = await this.prisma.officialSiteArticle.findFirst({
        where: { siteId, slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException('這個主題的網址已存在多個相近版本，請更換主題方向後再生成');
  }

  private slugAlternatives(base: string): string[] {
    const alternatives = new Set<string>([base]);
    const replacements: Array<[string, string]> = [
      ['services', 'solutions'],
      ['solutions', 'services'],
      ['guide', 'overview'],
      ['overview', 'guide'],
      ['implementation', 'process'],
      ['process', 'implementation'],
      ['how-to', 'best-practices'],
      ['best-practices', 'how-to'],
      ['faq', 'questions'],
      ['questions', 'faq'],
      ['comparison', 'benchmark'],
      ['benchmark', 'comparison'],
      ['selection', 'choosing'],
      ['choosing', 'selection'],
      ['pricing', 'cost'],
      ['cost', 'pricing'],
    ];
    for (const [from, to] of replacements) {
      if (base.split('-').includes(from)) alternatives.add(base.replace(`-${from}`, `-${to}`).replace(`${from}-`, `${to}-`));
    }
    alternatives.add(`${base}-insights`);
    alternatives.add(`${base}-explained`);
    alternatives.add(`${base}-checklist`);
    return [...alternatives].map((value) => value.slice(0, 100));
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
      const lastSegment = segments[segments.length - 1] || 'official-article';
      return this.buildSuggestedSlug(decodeURIComponent(lastSegment));
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
