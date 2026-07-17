import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
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

const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const MIN_ARTICLE_CHARS = 900;
const MAX_ARTICLE_CHARS = 8000;
const SOURCE_ARTICLE_LIMIT = 30;
const MAX_QUALITY_ATTEMPTS = 3;
const MIN_GEO_QUALITY_SCORE = 82;
const MIN_OFFICIAL_FACT_CONFIDENCE = 70;
const OFFICIAL_ARTICLE_STATUSES = ['draft', 'approved', 'export_ready'] as const;
const REQUIRED_GEO_CHECKS = [
  'minimumLength',
  'maximumLength',
  'hasHeading',
  'hasTitleConsistency',
  'hasStructuredSections',
  'includesBrandName',
  'includesGroundedEntity',
  'hasFactCoverage',
  'hasAnswerFirstOpening',
  'noPlaceholders',
  'noPlatformReferences',
  'hasFaq',
  'hasVisibleFaq',
  'hasAudienceBoundary',
  'noUnsupportedPromises',
  'noUnsupportedSpecificClaims',
  'belowDuplicateThreshold',
] as const;

const QUALITY_REASON_LABELS: Record<string, string> = {
  minimumLength: '文章長度不足',
  maximumLength: '文章長度過長',
  hasHeading: '缺少文章主標題',
  hasTitleConsistency: '正文主標題與文章標題不一致',
  hasStructuredSections: '缺少清楚的段落結構',
  includesBrandName: '正文缺少品牌名稱',
  includesGroundedEntity: '缺少可由第一方資料驗證的品牌或服務事實',
  hasFactCoverage: '可驗證的品牌事實不足兩項',
  hasAnswerFirstOpening: '開頭沒有直接回答品牌、服務與適用情境',
  noPlaceholders: '正文仍有待補資料或佔位符',
  noPlatformReferences: '正文含有 Geovault 或平台內部字樣',
  hasFaq: 'FAQ 少於三組或答案不完整',
  hasVisibleFaq: 'FAQ 問題沒有完整顯示於正文',
  hasAudienceBoundary: '適用對象或不適用限制沒有說清楚',
  hasActionableAnswer: '缺少可執行的直接答案',
  hasAiReadableStructure: '缺少 AI 容易擷取的問答結構',
  metaDescriptionReady: 'Meta Description 尚未達可用標準',
  keywordSetReady: '關鍵字數量應為 3 至 8 組',
  noUnsupportedPromises: '含有未經證實的排名或成效承諾',
  noUnsupportedSpecificClaims: '含有第一方資料未支持的年限、數據或效果宣稱',
  isScanAware: '內容尚未回應網站檢測重點',
  belowDuplicateThreshold: '與既有內容相似度過高',
};

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
    minimumConfidenceScore: number;
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
  previousDraft?: GeneratedPayload;
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
  scorePassed: boolean;
  requiredPassed: boolean;
  requiredChecks: string[];
  failedRequiredChecks: string[];
  advisoryFailedChecks: string[];
  attempts?: number;
  finalAttempt?: number;
  checks: Record<string, boolean>;
  charLength: number;
  similarityScore: number;
  similarityThreshold: number;
  matchedArticleId: string | null;
  unsupportedPromiseClaims: string[];
  unsupportedSpecificClaims: string[];
  failedReasons: string[];
}

const OFFICIAL_ARTICLE_OUTPUT_TOOL: Anthropic.Tool = {
  name: 'submit_official_site_article',
  description: '提交已依第一方資料完成、可供官網發布及 GEO 引用的文章內容。',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '官網文章標題，必須與正文唯一 H1 完全一致' },
      content: { type: 'string', description: '完整繁體中文 Markdown 正文' },
      metaDescription: { type: 'string', description: '包含品牌名稱的 60–180 字摘要' },
      keywords: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
      faq: {
        type: 'array', minItems: 3, maxItems: 6,
        items: {
          type: 'object',
          properties: { question: { type: 'string' }, answer: { type: 'string' } },
          required: ['question', 'answer'],
        },
      },
    },
    required: ['title', 'content', 'metaDescription', 'keywords', 'faq'],
  },
};

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

function factSegments(values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(/[，、；;。\n]+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 120))];
}

function extractUnsupportedSpecificClaims(content: string, graph: BrandFactGraph): string[] {
  const source = normalizeText([
    graph.brandName,
    graph.industry,
    graph.url,
    graph.location,
    graph.services,
    graph.positioning,
    graph.contact,
    ...graph.targetAudiences,
    ...graph.notFor,
    ...graph.verifiedFacts,
    ...graph.qaPairs.flatMap((pair) => [pair.question, pair.answer]),
  ].filter(Boolean).join(' '));
  const measurableClaims = content.match(
    /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千數幾兩]+)\s*(?:年|個?月|週|星期|天|日|小時|分鐘|%|％|倍)(?:以上|以下|左右|內|外|起)?/g,
  ) || [];
  const effectClaims = [
    '防污', '抗刮', '耐高溫', '耐酸鹼', '防潑水', '抗紫外線', '抗氧化',
  ].filter((phrase) => content.includes(phrase));
  return [...new Set([...measurableClaims, ...effectClaims])]
    .map((claim) => claim.replace(/\s+/g, ' ').trim())
    .filter((claim) => !source.includes(normalizeText(claim)));
}

function extractUnsupportedPromiseClaims(content: string): string[] {
  const pattern = /(?:唯一|第一名|業界第一|最佳選擇|保證|一定會|大幅提升|100\s*%)/i;
  return [...new Set(
    cleanMarkdown(content)
      .split(/[。！？\n]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0 && pattern.test(sentence))
      .map((sentence) => sentence.slice(0, 180)),
  )];
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

  return parseGeneratedRecord(parsed);
}

function parseGeneratedRecord(value: unknown): GeneratedPayload {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
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
  private readonly anthropic: Anthropic | null;
  private readonly openai: OpenAI | null;
  private readonly claudeModel: string;
  private readonly openaiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly brandFactService: BrandFactService,
    private readonly indexNow: IndexNowService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;
    this.claudeModel = this.config.get<string>('OFFICIAL_SITE_ARTICLE_CLAUDE_MODEL') || DEFAULT_CLAUDE_MODEL;
    const openAiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = openAiKey ? new OpenAI({ apiKey: openAiKey }) : null;
    this.openaiModel = this.config.get<string>('OFFICIAL_SITE_ARTICLE_AI_MODEL') || DEFAULT_OPENAI_MODEL;
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
    const qaTopics = graph.qaPairs
      .map((pair) => pair.question.trim())
      .filter((question) => question.length >= 8 && question.length <= 180);
    const brandName = site.name.trim().slice(0, 60) || '品牌';
    const industryName = site.industry?.trim().slice(0, 40) || '';
    const topicCandidates = [
      ...qaTopics,
      `${brandName}的服務內容、適用對象與合作前準備`,
      `${brandName}服務導入前需要確認的條件與流程`,
      `${brandName}常見需求、適用範圍與不適用情況`,
      `${brandName}${industryName ? ` ${industryName}` : ''}服務選擇與評估指南`,
      `${brandName}官方服務常見問題與決策重點`,
      `${brandName}合作流程、聯絡方式與下一步`,
      `${brandName}適合哪些客戶？服務範圍與判斷方式`,
    ].filter((candidate, index, all) => (
      candidate.length >= 8
      && candidate.length <= 180
      && all.findIndex((item) => normalizeText(item) === normalizeText(candidate)) === index
    ));
    const topic = topicCandidates.find((candidate) => !existingTopics.has(normalizeText(candidate)))
      || topicCandidates[0]
      || `${brandName}官方服務與適用對象指南`;
    const weakIndicator = geoContext.indicators.find((item) => item.status === 'fail' || item.status === 'warning');
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
        ready: this.brandFactService.isReadyForCitationContent(graph)
          && graph.confidenceScore >= MIN_OFFICIAL_FACT_CONFIDENCE,
        confidenceScore: graph.confidenceScore,
        minimumConfidenceScore: MIN_OFFICIAL_FACT_CONFIDENCE,
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
    if (!this.anthropic && !this.openai) {
      throw new BadRequestException('目前尚未設定 AI 生成金鑰（ANTHROPIC_API_KEY 或 OPENAI_API_KEY），無法生成官網專屬文章');
    }

    const graph = await this.brandFactService.buildForSite(siteId);
    if (
      !this.brandFactService.isReadyForCitationContent(graph)
      || graph.confidenceScore < MIN_OFFICIAL_FACT_CONFIDENCE
    ) {
      throw new BadRequestException({
        code: 'FIRST_PARTY_DATA_NOT_READY',
        message: `官網第一方資料未達高品質生成門檻（至少 ${MIN_OFFICIAL_FACT_CONFIDENCE}/100），請先補齊品牌資料與知識庫 Q&A`,
        confidenceScore: graph.confidenceScore,
        minimumConfidenceScore: MIN_OFFICIAL_FACT_CONFIDENCE,
        missingFacts: graph.missingFacts,
      });
    }

    const geoContext = await this.loadGeoContext(siteId);
    const recommendation = await this.buildRecommendation(site, graph, geoContext);
    const topicDirection = dto.topicDirection?.trim() || undefined;
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
    let generated: GeneratedPayload | null = null;
    let quality: QualityReport | null = null;
    let qualityFeedback = '';
    let previousDraft: GeneratedPayload | undefined;
    let finalAttempt = 0;

    for (let attempt = 1; attempt <= MAX_QUALITY_ATTEMPTS; attempt += 1) {
      finalAttempt = attempt;
      const prompt = this.buildPrompt(
        site,
        { topic, angle, canonicalUrl, topicDirection, qualityFeedback, previousDraft, geoContext },
        source,
        firstPartySnapshot,
      );
      try {
        generated = await this.requestGeneratedPayload(prompt, attempt);
        quality = await this.runQualityChecks(siteId, site.name, generated.content, generated, graph, geoContext);
        quality.attempts = attempt;
        quality.finalAttempt = attempt;
        if (quality.passed) break;
        qualityFeedback = this.buildQualityFeedback(quality, graph);
        previousDraft = generated;
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
    const targetKeywords = [...new Set([
      topic,
      ...(topicDirection ? [topicDirection] : []),
      ...(generated.keywords || []),
      ...(site.industry ? [site.industry] : []),
    ].map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    const articleSchema = this.buildArticleSchema({
      title: generated.title,
      description,
      canonicalUrl,
      siteName: site.name,
      siteUrl: site.url,
      industry: site.industry,
      keywords: targetKeywords,
    });
    const faqSchema = this.buildFaqSchema(generated.faq || []);

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
          ? `${quality.failedReasons.map((reason) => QUALITY_REASON_LABELS[reason] || reason).join('；')}${quality.passed ? '' : `；已自動優化 ${quality.finalAttempt || MAX_QUALITY_ATTEMPTS} 次仍未達標，建議換一個主題方向`}`
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
      '<meta property="og:type" content="article">',
      `<meta property="og:title" content="${this.escapeHtml(article.metaTitle || article.title)}">`,
      `<meta property="og:description" content="${this.escapeHtml(article.metaDescription || article.description)}">`,
      `<meta property="og:url" content="${this.escapeHtml(article.canonicalUrl)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${this.escapeHtml(article.metaTitle || article.title)}">`,
      `<meta name="twitter:description" content="${this.escapeHtml(article.metaDescription || article.description)}">`,
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

  private async requestGeneratedPayload(prompt: string, attempt: number): Promise<GeneratedPayload> {
    const temperature = attempt === 1 ? 0.65 : 0.45;
    let claudeError: unknown;

    if (this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: this.claudeModel,
          max_tokens: 6500,
          tools: [OFFICIAL_ARTICLE_OUTPUT_TOOL],
          tool_choice: { type: 'tool', name: OFFICIAL_ARTICLE_OUTPUT_TOOL.name },
          system: '你是專業 GEO 官網內容總編。目標是讓真實品牌更容易被 AI 收錄、引用、推薦與摘要。只使用客戶第一方資料，不得捏造服務、地點、聯絡方式、價格、成效或案例；每次輸出都必須依品質回饋修正。',
          messages: [{ role: 'user', content: prompt }],
        });
        const legacyRaw = (response as unknown as { choices?: Array<{ message?: { content?: string } }> })
          .choices?.[0]?.message?.content;
        if (legacyRaw) return parseJsonResponse(legacyRaw);
        const toolBlock = response.content.find((block) => block.type === 'tool_use');
        if (toolBlock?.type === 'tool_use') return parseGeneratedRecord(toolBlock.input);
        const textBlock = response.content.find((block) => block.type === 'text');
        return parseJsonResponse(textBlock?.type === 'text' ? textBlock.text : '');
      } catch (error) {
        claudeError = error;
        this.logger.warn(`Claude official article generation failed (${this.claudeModel}): ${this.describeProviderError(error)}`);
      }
    }

    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          temperature,
          max_tokens: 6500,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是專業 GEO 官網內容總編。只使用客戶第一方資料，不得捏造服務、地點、聯絡方式、價格、成效或案例；請依使用者指令只回傳完整 JSON。',
            },
            { role: 'user', content: prompt },
          ],
        });
        return parseJsonResponse(response.choices[0]?.message?.content || '');
      } catch (error) {
        this.logger.error(`OpenAI official article fallback failed (${this.openaiModel}): ${this.describeProviderError(error)}`);
        if (claudeError) {
          throw new BadRequestException('Claude Opus 4.8 暫時無法生成，備援 AI 也無法完成請求，請稍後再試');
        }
        throw error;
      }
    }

    throw new BadRequestException('Claude Opus 4.8 暫時無法生成，且未設定備援 AI 金鑰，請聯絡管理員');
  }

  private describeProviderError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 240);
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
5. 產出清理後至少 1200、目標 1200–1600 字的繁體中文正文，使用 Markdown 標題與段落，FAQ 至少 3 題。不要用重複句灌水；每一段都要提供新的判斷、條件、步驟或第一方事實。
6. Markdown 只作為內容結構格式：第一行只能有一個 H1；H2/H3 必須各自獨立成行；粗體只用於短語；清單每項各自一行，確保轉成 CMS HTML 後是正常文章版面。
7. 第一方資料中的服務、適用對象與不適用限制若有值，正文需各自至少逐字使用一個可驗證短語；不要只用意思相近但無法核對的改寫。

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
- H1 後前兩段必須直接說明品牌是誰、提供什麼、適合誰與已知限制；不要用故事或口號開場。
- 正文至少明確使用兩項第一方事實；FAQ 的問題必須真的出現在正文中，每個答案要完整可獨立引用。
- Meta Description 需包含品牌名稱與直接價值，控制在 60–180 字；keywords 提供 3–8 個不重複詞組。
- 禁止「唯一、第一、最佳、保證、一定、大幅提升、100%」等無來源的排名、成效或絕對承諾。
- 送出前必須逐字掃描正文與 FAQ；只要仍出現上述禁用承諾字眼，就先重寫該句再提交。
- 任何年、月、週、天、百分比、價格、耐久期間，或「防污、抗刮、耐高溫」等效果宣稱，只能在客戶第一方資料中有逐字依據時使用；沒有依據就不要自行補充常識或推估。
- 不要提及 Geovault、平台文章、GEO 分數或第三方來源，也不要把檢測分數當成客戶成效宣稱。

最新網站掃描與 AI 引用檢測摘要（僅用於判斷內容重點，不可在文章中捏造或宣稱）：
${JSON.stringify(brief.geoContext, null, 2)}

${brief.qualityFeedback ? `上一輪品質回饋（本輪必須修正）：\n${brief.qualityFeedback}\n` : ''}

${brief.previousDraft ? `上一版完整草稿（請針對回饋修復，不要忽略或只重新改寫一次）：\n${JSON.stringify(brief.previousDraft, null, 2)}\n` : ''}

平台文章僅提供以下「主題靈感 metadata」，不可使用其正文：
${source ? JSON.stringify({ title: source.title, description: source.description, keywords: source.targetKeywords }, null, 2) : '(沒有指定平台文章，請依主題重新規劃)'}

客戶第一方資料：
${JSON.stringify(firstPartySnapshot, null, 2)}

請只回傳 JSON object，不要 Markdown code fence：
{
  "title": "官網文章標題",
  "content": "完整且可無損轉成 CMS HTML 的 Markdown 正文，第一行使用唯一的 # 標題",
  "metaDescription": "包含品牌名稱、60–180 字的官網摘要",
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
    const contentTitle = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
    const opening = cleanMarkdown(content.replace(/^#\s+.+$/m, '')).slice(0, 600);
    const groundedEntityAnchors = factSegments([
      graph.services,
      graph.industry,
      graph.positioning,
      graph.location,
    ]);
    const hasGroundedEntity = groundedEntityAnchors
      .some((value) => normalizeText(plain).includes(normalizeText(value)));
    const factAnchors = factSegments([
      graph.services,
      graph.positioning,
      graph.location,
      ...graph.targetAudiences,
      ...graph.notFor,
    ]);
    const matchedFactAnchors = factAnchors.filter((value) =>
      normalizeText(plain).includes(normalizeText(value)),
    ).length;
    const requiredFactAnchors = Math.min(2, factAnchors.length);
    const visibleFaqQuestions = (generated.faq || []).filter((faq) =>
      normalizeText(plain).includes(normalizeText(faq.question)),
    ).length;
    const usefulFaq = Boolean(
      generated.faq
      && generated.faq.length >= 3
      && generated.faq.every((faq) => faq.question.trim().length >= 6 && faq.answer.trim().length >= 20),
    );
    const keywords = [...new Set((generated.keywords || []).map((keyword) => normalizeText(keyword)).filter(Boolean))];
    const metaDescription = generated.metaDescription?.trim() || '';
    const unsupportedPromiseClaims = extractUnsupportedPromiseClaims(content);
    const unsupportedSpecificClaims = extractUnsupportedSpecificClaims(content, graph);
    const hasScanAwareStructure = geoContext.indicators.length === 0
      || /(?:FAQ|常見問題|結構化|可讀|回答|步驟|描述|標題)/i.test(content);
    const checks: Record<string, boolean> = {
      minimumLength: plain.length >= MIN_ARTICLE_CHARS,
      maximumLength: plain.length <= MAX_ARTICLE_CHARS,
      hasHeading: /^#\s+.+/m.test(content),
      hasTitleConsistency: normalizeText(contentTitle) === normalizeText(generated.title),
      hasStructuredSections: headingCount >= 4,
      includesBrandName: normalizeText(plain).includes(normalizeText(siteName)),
      includesGroundedEntity: hasGroundedEntity,
      hasFactCoverage: requiredFactAnchors === 0 || matchedFactAnchors >= requiredFactAnchors,
      hasAnswerFirstOpening: normalizeText(opening).includes(normalizeText(siteName))
        && /(?:提供|協助|適合|服務|產品|專注|是)/.test(opening),
      noPlaceholders: !/(?:TODO|TBD|XXX|\[待補|\{.*?\})/i.test(content),
      noPlatformReferences: !/(?:Geovault|client_daily|平台文章|發布包)/i.test(content),
      hasFaq: usefulFaq,
      hasVisibleFaq: visibleFaqQuestions >= Math.min(3, generated.faq?.length || 0),
      hasAudienceBoundary: (graph.targetAudiences.length === 0
        || factSegments(graph.targetAudiences).some((value) => normalizeText(plain).includes(normalizeText(value))))
        && (graph.notFor.length === 0
          || factSegments(graph.notFor).some((value) => normalizeText(plain).includes(normalizeText(value)))),
      hasActionableAnswer: /(?:結論|重點|步驟|建議|可以|應該|適合|不適合)/i.test(content),
      hasAiReadableStructure: /(?:常見問題|FAQ|問：|Q[:：])/i.test(content),
      metaDescriptionReady: metaDescription.length >= 60
        && metaDescription.length <= 180
        && normalizeText(metaDescription).includes(normalizeText(siteName)),
      keywordSetReady: keywords.length >= 3 && keywords.length <= 8,
      noUnsupportedPromises: unsupportedPromiseClaims.length === 0,
      noUnsupportedSpecificClaims: unsupportedSpecificClaims.length === 0,
      isScanAware: hasScanAwareStructure,
      belowDuplicateThreshold: similarity.score < DEFAULT_DUPLICATE_THRESHOLD,
    };
    for (const [key, passed] of Object.entries(checks)) {
      if (!passed) failedReasons.push(key);
    }
    const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    const requiredChecks = [...REQUIRED_GEO_CHECKS];
    const requiredSet = new Set<string>(requiredChecks);
    const failedRequiredChecks = requiredChecks.filter((key) => !checks[key]);
    const advisoryFailedChecks = failedReasons.filter((key) => !requiredSet.has(key));
    const scorePassed = score >= MIN_GEO_QUALITY_SCORE;
    const requiredPassed = failedRequiredChecks.length === 0;
    return {
      passed: scorePassed && requiredPassed,
      score,
      minimumScore: MIN_GEO_QUALITY_SCORE,
      scorePassed,
      requiredPassed,
      requiredChecks,
      failedRequiredChecks,
      advisoryFailedChecks,
      checks,
      charLength: plain.length,
      similarityScore: similarity.score,
      similarityThreshold: DEFAULT_DUPLICATE_THRESHOLD,
      matchedArticleId,
      unsupportedPromiseClaims,
      unsupportedSpecificClaims,
      failedReasons,
    };
  }

  private buildQualityFeedback(quality: QualityReport, graph: BrandFactGraph): string {
    const details = quality.failedReasons.map((reason) => {
      if (reason === 'minimumLength') {
        const missing = Math.max(0, MIN_ARTICLE_CHARS - quality.charLength);
        return `目前清理後正文只有 ${quality.charLength} 字，最低要求 ${MIN_ARTICLE_CHARS} 字，還差 ${missing} 字；本輪請完整修復上一稿，產出至少 1200 字，不得用重複句灌水`;
      }
      if (reason === 'maximumLength') {
        return `目前清理後正文 ${quality.charLength} 字，超過 ${MAX_ARTICLE_CHARS} 字；請保留事實與答案，刪除重複背景與空泛段落`;
      }
      if (reason === 'metaDescriptionReady') {
        return `Meta Description 目前長度不足或未包含品牌名；請重新寫成 80–150 字，且必須包含品牌名稱與直接價值`;
      }
      if (reason === 'noUnsupportedPromises') {
        return `以下原句含有禁止的排名、保證或成效承諾：「${quality.unsupportedPromiseClaims.join('」；「')}」；請完整重寫這些句子，移除「唯一、第一、最佳選擇、保證、一定、大幅提升、100%」等字眼，不得只換標點或保留同義承諾`;
      }
      if (reason === 'noUnsupportedSpecificClaims') {
        return `以下宣稱沒有在第一方資料逐字找到依據：「${quality.unsupportedSpecificClaims.join('」、「')}」；請刪除或改為不帶年限、數據與效果保證的可驗證描述`;
      }
      if (reason === 'includesGroundedEntity') {
        const examples = factSegments([
          graph.services,
          graph.positioning,
          graph.location,
          graph.industry,
        ]).slice(0, 3);
        return `${QUALITY_REASON_LABELS[reason]}${examples.length > 0 ? `，請逐字使用至少一項：「${examples.join('」或「')}」` : ''}`;
      }
      if (reason === 'hasAudienceBoundary') {
        const audience = factSegments(graph.targetAudiences).slice(0, 3).join('、');
        const notFor = factSegments(graph.notFor).slice(0, 3).join('、');
        return `${QUALITY_REASON_LABELS[reason]}${audience ? `；適用對象需包含「${audience}」` : ''}${notFor ? `；不適用限制需包含「${notFor}」` : ''}`;
      }
      return QUALITY_REASON_LABELS[reason] || reason;
    });

    return `上一版未達標，請針對上一版草稿逐項修復，不要忽略回饋：${details.join('、')}。品質分數 ${quality.score}/${quality.minimumScore}，清理後正文 ${quality.charLength} 字。請優先改善直接回答、可引用的第一方事實、清楚段落、FAQ 與安全的具體描述。`;
  }

  private buildArticleSchema(input: {
    title: string;
    description: string;
    canonicalUrl: string;
    siteName: string;
    siteUrl: string;
    industry: string | null;
    keywords: string[];
  }) {
    const generatedAt = new Date().toISOString();
    return {
      headline: input.title,
      description: input.description,
      url: input.canonicalUrl,
      mainEntityOfPage: input.canonicalUrl,
      author: { '@type': 'Organization', name: input.siteName, url: input.siteUrl },
      publisher: { '@type': 'Organization', name: input.siteName, url: input.siteUrl },
      about: [input.siteName, input.industry].filter(Boolean),
      keywords: input.keywords,
      inLanguage: 'zh-TW',
      datePublished: generatedAt,
      dateModified: generatedAt,
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
