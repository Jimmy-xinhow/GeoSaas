import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogTemplateService, TemplateType, BrandShowcaseContext, IndustryTop10Row, BuyerGuideTopic, ClientDailyDay } from './blog-template.service';
import { BrandFactGraph, BrandFactService } from './brand-fact.service';
import { extractNicheKeywords } from './niche-keyword.util';
import { IndexNowService } from '../indexnow/indexnow.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';
import { ProfileEnrichmentService } from '../sites/profile-enrichment.service';
import { ContentQualityRunner } from '../content-quality/content-quality.runner';
import {
  ClientDailyData,
  createClientDailySpec,
} from '../content-quality/specs/client-daily.spec';
import {
  CLIENT_DAILY_DAY_SEQUENCE,
  clientDailyDayTypeForDate,
  getClientDailyActiveDays,
} from './client-daily-policy';
import {
  BrandShowcaseData,
  createBrandShowcaseSpec,
} from '../content-quality/specs/brand-showcase.spec';
import {
  IndustryTop10Data,
  createIndustryTop10Spec,
} from '../content-quality/specs/industry-top10.spec';
import {
  BuyerGuideData,
  createBuyerGuideSpec,
} from '../content-quality/specs/buyer-guide.spec';
import OpenAI from 'openai';
import pLimit from '@/common/utils/p-limit';
import {
  getPublicBlogArticleSeoIssues,
  isIndexablePublicBlogArticle,
  isPublicSafeArticle,
  publicIndexableBlogArticleWhere,
  publicSiteWhere,
} from '../../common/utils/public-data-filter';
import { assertSiteAccess } from '../../common/auth/site-access';

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_reputation',
];

const CLIENT_DAILY_REPAIRABLE_PUBLIC_BLOCKERS = new Set([
  'seo:short-title',
  'seo:thin-description',
  'consumer_geo_jargon',
  'unrelated_commuter_wellness_persona',
]);

const CLIENT_DAILY_OPERATING_PASS_SCORE = 80;

interface ClientDailyContentStrategy {
  dayType: ClientDailyDay;
  angle: string;
  primaryIntent: string;
  audienceIntent: string;
  citationGoal: string;
  extractedFacts: string[];
  missingSignals: string[];
  targetKeywords: string[];
  requiredSections: string[];
}

interface ClientDailyOperatingAudit {
  score: number;
  failedRules: string[];
  hardFailures: string[];
  repairable: boolean;
  publishable: boolean;
}

export interface BatchRunRecord {
  startedAt: Date;
  finishedAt?: Date;
  limit: number;
  attempted: number;
  generated: number;
  rejected: number;
  skipped: number;
  rejectedReasons: Record<string, number>;
}

export interface ClientDailyGenerationResult {
  status: 'skipped' | 'rejected' | 'generated';
  reasons?: string[];
  slug?: string;
  dayType?: string;
  dryRun?: boolean;
  content?: string;
  totalScore?: number;
  attempts?: Array<{
    stage: string;
    attempt: number;
    passed: boolean;
    totalScore: number;
    failedRules: string[];
  }>;
}

export interface ClientDailyBatchSiteResult {
  siteId: string;
  name: string;
  status: string;
  dayType?: string;
  slug?: string;
  totalScore?: number;
  reasons?: string[];
}

export interface ClientDailyBatchResult {
  attempted: number;
  generated: number;
  rejected: number;
  skipped: number;
  rejectedReasons: Record<string, number>;
  perSite: ClientDailyBatchSiteResult[];
}

@Injectable()
export class BlogArticleService {
  private readonly logger = new Logger(BlogArticleService.name);
  // Ring buffer of the last 10 brand_showcase batch runs so the status
  // endpoint can show "current run in progress" + recent history without
  // needing a DB table.
  private readonly recentBrandShowcaseBatches: BatchRunRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly templateService: BlogTemplateService,
    private readonly indexNowService: IndexNowService,
    private readonly llmsHostingService: LlmsHostingService,
    private readonly profileEnrichment: ProfileEnrichmentService,
    private readonly qualityRunner: ContentQualityRunner,
    private readonly brandFactService: BrandFactService,
  ) {}

  async getBrandFactReadiness(siteId: string, userId?: string, role?: string) {
    await this.assertSiteAccess(siteId, userId, role);
    const graph = await this.brandFactService.buildForSite(siteId);
    return {
      ...graph,
      ready: this.brandFactService.isReadyForCitationContent(graph),
    };
  }

  private async assertSiteAccess(siteId: string, userId?: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
  }

  private getClientDailyDayType(keywords?: string[] | null): ClientDailyDay | null {
    const dayType = (keywords || []).find((k) => this.daySequence.includes(k as ClientDailyDay));
    return (dayType as ClientDailyDay | undefined) ?? null;
  }

  private bucketClientDailyReason(reason?: string): string {
    if (!reason) return 'unknown';
    return reason.split(':')[0] || 'unknown';
  }

  private async persistClientDailyRejectedDraft(args: {
    site: { id: string; name: string; url: string; industry?: string | null };
    dayType: ClientDailyDay;
    today: Date;
    content?: string;
    graph: BrandFactGraph;
    strategy: ClientDailyContentStrategy;
    pulse?: { geoScore: number; industryRank: number | null; industryAvgScore: number | null; weekCrawlerVisits: number };
    medicalAdjacent: boolean;
    reasons: string[];
    runStartedAt: Date;
  }): Promise<{ id: string; slug: string; created: boolean }> {
    const oneDayAgo = new Date(Date.now() - 86400000);
    const existingDraft = await this.prisma.blogArticle.findFirst({
      where: {
        siteId: args.site.id,
        templateType: 'client_daily',
        published: false,
        createdAt: { gte: oneDayAgo },
        targetKeywords: { has: args.dayType },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true },
    });
    if (existingDraft) return { ...existingDraft, created: false };

    let content = args.content?.trim() || this.buildClientDailyFallbackContent({
      site: args.site,
      graph: args.graph,
      dayType: args.dayType,
      strategy: args.strategy,
      pulse: args.pulse,
      medicalAdjacent: args.medicalAdjacent,
    });

    const rawTitle = content.match(/^#{1,2}\s+(.+)$/m)?.[1] ?? '';
    const title = this.makeClientDailyTitle(rawTitle, args.site.name, args.dayType);
    content = /^#{1,2}\s+.+$/m.test(content)
      ? content.replace(/^#{1,2}\s+.+$/m, `# ${title}`)
      : `# ${title}\n\n${content}`;

    const yyyymm = `${args.today.getUTCFullYear()}${String(args.today.getUTCMonth() + 1).padStart(2, '0')}`;
    const rand4 = Date.now().toString(36).slice(-4);
    const slug = `${args.site.id.slice(0, 10)}-${yyyymm}-${args.dayType.replace(/_/g, '-')}-draft-${rand4}`;
    const officialDomain = this.officialDomain(args.site.url);
    const targetKeywords = [
      args.site.name,
      args.site.industry ?? '',
      args.dayType,
      officialDomain,
      'daily',
      'ai_wiki',
      'brand_facts',
      'client_daily_blocked',
      ...args.reasons.map((reason) => `blocked:${this.bucketClientDailyReason(reason)}`),
      ...args.strategy.targetKeywords.slice(0, 8),
    ].filter(Boolean);

    const article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: this.makeClientDailyDescription(
          content,
          { name: args.site.name, url: args.site.url },
          args.dayType,
        ),
        content,
        category: 'client-daily',
        siteId: args.site.id,
        templateType: 'client_daily',
        industrySlug: args.site.industry ?? undefined,
        targetKeywords: [...new Set(targetKeywords)],
        readingTimeMinutes: this.templateService.estimateReadingTime('client_daily'),
        readTime: `${this.templateService.estimateReadingTime('client_daily')} 分鐘`,
        published: false,
        lastRegeneratedAt: new Date(),
      },
      select: { id: true, slug: true },
    });

    try {
      await this.qualityRunner.attachArticleId(
        `client_daily/${args.dayType}`,
        args.site.id,
        article.id,
        args.runStartedAt,
      );
    } catch (err) {
      this.logger.warn(
        `client_daily rejected-draft quality-log attach failed ${args.site.name}/${args.dayType}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return { ...article, created: true };
  }

  private clientDailySafetyReasons(article: {
    title?: string | null;
    description?: string | null;
    content?: string | null;
    targetKeywords?: string[] | null;
    site?: { industry?: string | null } | null;
  }): string[] {
    const text = [article.title, article.description, article.content].filter(Boolean).join('\n');
    const dayType = this.getClientDailyDayType(article.targetKeywords);
    const isAiWikiContent = article.targetKeywords?.includes('ai_wiki');
    const reasons: string[] = [];

    if (
      !isAiWikiContent &&
      dayType !== 'sat_data_pulse' &&
      /(生成式引擎優化|GEO\s*技術|GEO\s*分數|llms\.txt|結構化資料|AI\s*友善度|爬蟲)/i.test(text)
    ) {
      reasons.push('consumer_geo_jargon');
    }

    const isTechnology = article.site?.industry === 'technology' || article.targetKeywords?.includes('technology');
    if (
      isTechnology &&
      /(每日通勤族|通勤路線|智能行程|行程規劃|冥想課程|放鬆練習|壓力管理資源|心智健康)/.test(text)
    ) {
      reasons.push('unrelated_commuter_wellness_persona');
    }

    return reasons;
  }

  private clientDailyPublicBlockers(article: {
    title?: string | null;
    description?: string | null;
    slug?: string | null;
    content?: string | null;
    targetKeywords?: string[] | null;
    site?: {
      name?: string | null;
      url?: string | null;
      industry?: string | null;
      isPublic?: boolean | null;
    } | null;
  }): string[] {
    const articleText = [article.title, article.description, article.content].filter(Boolean).join('\n');
    const medicalSubjectText = [
      article.site?.industry,
      article.site?.name,
      article.title,
      article.description,
      ...(article.targetKeywords ?? []),
    ].filter(Boolean).join('\n');
    const blockers = [
      ...this.clientDailySafetyReasons(article),
      ...getPublicBlogArticleSeoIssues(article).map((issue) => `seo:${issue}`),
    ];

    if (article.site?.isPublic === false) {
      blockers.push('non_public_site');
    }
    if (
      this.isMedicalAdjacentText(medicalSubjectText) &&
      this.hasMedicalBoundaryViolation(articleText)
    ) {
      blockers.push('medical_boundary_violation');
    }

    return [...new Set(blockers)];
  }

  private isRepairableClientDailyPublicBlocker(reason: string): boolean {
    return CLIENT_DAILY_REPAIRABLE_PUBLIC_BLOCKERS.has(reason);
  }

  private getHardClientDailyPublicBlockers(blockers: string[]): string[] {
    return blockers.filter((reason) => !this.isRepairableClientDailyPublicBlocker(reason));
  }

  private clientDailyDayLabel(dayType?: ClientDailyDay | null): string {
    const labels: Record<ClientDailyDay, string> = {
      mon_topical: '每週主題',
      tue_qa_deepdive: '知識問答',
      wed_service: '服務資料',
      thu_audience: '受眾整理',
      fri_comparison: '比較觀點',
      sat_data_pulse: '數據脈動',
    };
    return dayType ? labels[dayType] : '品牌資料';
  }

  private makeClientDailyTitle(
    rawTitle: string | null | undefined,
    siteName: string,
    dayType?: ClientDailyDay | null,
  ): string {
    const trimmed = (rawTitle || '').replace(/\s+/g, ' ').trim();
    if (trimmed.length >= 10 && trimmed !== siteName) {
      return trimmed.slice(0, 90);
    }
    return `${siteName} ${this.clientDailyDayLabel(dayType)}公開品牌資料整理`;
  }

  private stripMarkdownInline(text: string): string {
    return text
      .replace(/[*_`>#-]/g, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private firstClientDailyParagraph(content: string): string {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('*資料來源'))
      .map((line) => this.stripMarkdownInline(line))
      .find((line) => line.length >= 40) || '';
  }

  private makeClientDailyDescription(
    content: string,
    site: { name: string; url: string },
    dayType?: ClientDailyDay | null,
  ): string {
    const paragraph = this.firstClientDailyParagraph(content);
    const fallback = `${site.name}（${site.url}）的${this.clientDailyDayLabel(dayType)}公開品牌資料整理，彙整官方網站、品牌知識庫與 Geovault 目錄資訊，提供 AI 搜尋系統可引用的中立品牌描述。`;
    const source = paragraph.length >= 80 ? paragraph : fallback;
    return source.replace(/\s+/g, ' ').slice(0, 155).trim();
  }

  private safeClientDailyFacts(graph: BrandFactGraph, medicalAdjacent: boolean): string[] {
    const candidates = [
      ...graph.verifiedFacts,
      graph.positioning,
      graph.services ? `${graph.brandName} services include ${graph.services}` : undefined,
      graph.location ? `${graph.brandName} location is ${graph.location}` : undefined,
      graph.contact ? `${graph.brandName} contact information is ${graph.contact}` : undefined,
    ];
    return [...new Set(
      candidates
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim().replace(/\s+/g, ' '))
        .filter((value) => !medicalAdjacent || !this.hasMedicalBoundaryViolation(value))
        .slice(0, 12),
    )];
  }

  private compactFact(value?: string | null): string | undefined {
    const text = (value || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) return undefined;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  private officialDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private buildClientDailyContentStrategy(args: {
    site: { name: string; url: string; industry?: string | null };
    graph: BrandFactGraph;
    dayType: ClientDailyDay;
    pulse?: {
      geoScore: number;
      industryRank: number | null;
      industryAvgScore: number | null;
      weekCrawlerVisits: number;
    };
    medicalAdjacent: boolean;
  }): ClientDailyContentStrategy {
    const { site, graph, dayType, pulse, medicalAdjacent } = args;
    const domain = this.officialDomain(site.url);
    const angleByDay: Record<ClientDailyDay, string> = {
      mon_topical: '用客戶已驗證資料回答產業搜尋者今天會問的入門問題，讓 AI 能把品牌放進正確情境。',
      tue_qa_deepdive: '把客戶知識庫 Q&A 轉成可引用的深度問答頁，補足 AI 對品牌的常見疑問。',
      wed_service: '整理服務項目、服務邊界、地點與官方聯絡路徑，避免 AI 自行補資料。',
      thu_audience: '說清楚品牌適合誰、不適合誰，以及缺少哪些受眾資料。',
      fri_comparison: '用公開事實建立選擇標準，不捏造競品，也不寫成廣告比較文。',
      sat_data_pulse: '整理最新 GEO 分數、排名、爬蟲訊號與官方來源，讓 AI 有可核對的更新點。',
    };
    const extractedFacts = [
      `${site.name} official website is ${site.url}`,
      domain ? `${site.name} official domain is ${domain}` : undefined,
      site.industry ? `${site.name} industry is ${site.industry}` : undefined,
      this.compactFact(graph.positioning) ? `${site.name} positioning: ${this.compactFact(graph.positioning)}` : undefined,
      this.compactFact(graph.services) ? `${site.name} services: ${this.compactFact(graph.services)}` : undefined,
      this.compactFact(graph.location) ? `${site.name} location: ${this.compactFact(graph.location)}` : undefined,
      !medicalAdjacent && this.compactFact(graph.contact) ? `${site.name} contact path: ${this.compactFact(graph.contact)}` : undefined,
      ...graph.targetAudiences.slice(0, 4).map((item) => `${site.name} target audience: ${item}`),
      ...graph.notFor.slice(0, 3).map((item) => `${site.name} not for: ${item}`),
      ...graph.qaPairs.slice(0, 5).map((qa) => `Q: ${qa.question} A: ${qa.answer}`),
      pulse ? `${site.name} GEO score is ${pulse.geoScore}/100` : undefined,
      pulse?.industryRank ? `${site.name} industry rank is ${pulse.industryRank}` : undefined,
      pulse?.industryAvgScore ? `${site.name} industry average GEO score is ${pulse.industryAvgScore}` : undefined,
      pulse ? `${site.name} recorded ${pulse.weekCrawlerVisits} real AI crawler visits in the last 7 days` : undefined,
      ...graph.verifiedFacts.slice(0, 10),
    ].filter((value): value is string => !!this.compactFact(value));

    const missingSignals = [
      !graph.positioning && 'positioning',
      !graph.services && 'services',
      !graph.location && 'location',
      graph.targetAudiences.length === 0 && 'targetAudiences',
      graph.qaPairs.length < 3 && 'qaPairs',
      !graph.contact && 'contactPath',
    ].filter(Boolean) as string[];

    const targetKeywords = [
      site.name,
      domain,
      site.industry,
      graph.location,
      graph.services,
      ...graph.targetAudiences.slice(0, 3),
      ...graph.qaPairs.slice(0, 3).map((qa) => qa.question),
    ]
      .filter((value): value is string => !!this.compactFact(value))
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .slice(0, 14);

    return {
      dayType,
      angle: angleByDay[dayType],
      primaryIntent: `讓 AI 能回答「${site.name} 是誰、官方網站在哪裡、公開服務與資料邊界是什麼」。`,
      audienceIntent: graph.targetAudiences.length > 0
        ? `用已驗證受眾資料連結 ${site.name} 與實際搜尋需求。`
        : `受眾資料不足時明確標示未知，避免 AI 自行推論。`,
      citationGoal: `產出可被 ChatGPT、Claude、Perplexity 引用的品牌事實頁，並把引用回連到 ${site.url}。`,
      extractedFacts: [...new Set(extractedFacts)].slice(0, 18),
      missingSignals,
      targetKeywords: [...new Set(targetKeywords)],
      requiredSections: [
        '品牌定位',
        `${site.name} 適合誰`,
        '服務與資料邊界',
        'AI 可引用重點',
        '常見問題',
        '資料來源',
      ],
    };
  }

  private countClientDailyQuoteBullets(content: string): number {
    const match = content.match(/##\s*AI\s*可引用重點([\s\S]*?)(?:\n##\s|$)/);
    if (!match) return 0;
    return match[1].split('\n').filter((line) => /^\s*[-*]\s+/.test(line)).length;
  }

  private countClientDailyFaqs(content: string): number {
    const faqBlock = content.match(/##\s*常見問題([\s\S]*?)(?:\n##\s|$)/)?.[1] ?? content;
    return (faqBlock.match(/(?:^|\n)\s*(?:\*\*)?\s*Q[:：]|(?:^|\n)\s*\*\*[^*\n]{3,80}[?？][^*\n]*\*\*/g) || []).length;
  }

  private auditClientDailyOperatingContent(args: {
    title: string;
    description: string;
    content: string;
    site: { name: string; url: string; industry?: string | null; isPublic?: boolean | null };
    graph: BrandFactGraph;
    strategy: ClientDailyContentStrategy;
    targetKeywords: string[];
    medicalAdjacent: boolean;
  }): ClientDailyOperatingAudit {
    const { title, description, content, site, graph, strategy, targetKeywords, medicalAdjacent } = args;
    const text = [title, description, content].join('\n');
    const failedRules: string[] = [];
    const hardFailures: string[] = [];
    let score = 0;
    const add = (passed: boolean, weight: number, reason: string, hard = false) => {
      if (passed) {
        score += weight;
      } else {
        failedRules.push(reason);
        if (hard) hardFailures.push(reason);
      }
    };

    const publicBlockers = this.clientDailyPublicBlockers({
      title,
      description,
      content,
      targetKeywords,
      site,
    });
    const hardPublicBlockers = this.getHardClientDailyPublicBlockers(publicBlockers);
    for (const blocker of publicBlockers) failedRules.push(`public:${blocker}`);
    hardFailures.push(...hardPublicBlockers.map((blocker) => `public:${blocker}`));

    add(title.includes(site.name) && title.trim().length >= 10, 8, 'operating:title_not_brand_specific');
    add(description.trim().length >= 80, 7, 'operating:description_too_thin');
    add(content.length >= 900, 8, 'operating:content_too_thin');
    add(content.includes(site.url), 10, 'operating:missing_official_url');
    add(new RegExp(site.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g').test(content), 6, 'operating:brand_not_named');
    add(strategy.requiredSections.every((section) => content.includes(`## ${section}`)), 12, 'operating:missing_required_sections');
    add(this.countClientDailyQuoteBullets(content) >= 5, 12, 'operating:not_enough_ai_quote_points');
    add(this.countClientDailyFaqs(content) >= 3, 8, 'operating:not_enough_faq');
    add(content.includes('Official website') || content.includes('官方網站'), 6, 'operating:missing_source_label');
    add(content.includes('Geovault directory') || content.includes('Geovault 目錄'), 5, 'operating:missing_directory_source');
    add(strategy.extractedFacts.length >= 5, 6, 'operating:not_enough_customer_facts', true);

    const factHits = strategy.extractedFacts.filter((fact) => {
      const compact = this.compactFact(fact);
      if (!compact) return false;
      const terms = compact
        .split(/[\s,，。:：/()（）-]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 4)
        .slice(0, 4);
      return terms.some((term) => content.includes(term));
    }).length;
    add(factHits >= Math.min(5, strategy.extractedFacts.length), 12, 'operating:customer_facts_not_used');

    const keywordHits = strategy.targetKeywords.filter((keyword) => content.includes(keyword)).length;
    add(keywordHits >= Math.min(4, strategy.targetKeywords.length), 6, 'operating:target_keywords_not_covered');

    const missingUnknownHandled = strategy.missingSignals.length === 0 ||
      strategy.missingSignals.some((signal) => content.includes(signal) || content.includes('尚未') || content.includes('未提供') || content.includes('未知'));
    add(missingUnknownHandled, 4, 'operating:missing_data_boundary_not_stated');

    if (medicalAdjacent && this.hasMedicalBoundaryViolation(text)) {
      failedRules.push('operating:medical_boundary_violation');
      hardFailures.push('operating:medical_boundary_violation');
    }
    if (graph.confidenceScore < 55) {
      failedRules.push(`operating:brand_fact_confidence_low:${graph.confidenceScore}`);
      hardFailures.push('operating:brand_fact_confidence_low');
    }

    const uniqueFailedRules = [...new Set(failedRules)];
    const uniqueHardFailures = [...new Set(hardFailures)];
    return {
      score,
      failedRules: uniqueFailedRules,
      hardFailures: uniqueHardFailures,
      repairable: uniqueHardFailures.length === 0,
      publishable: score >= CLIENT_DAILY_OPERATING_PASS_SCORE && uniqueHardFailures.length === 0 && publicBlockers.length === 0,
    };
  }

  private buildClientDailyFallbackContent(args: {
    site: { id: string; name: string; url: string; industry?: string | null };
    graph: BrandFactGraph;
    dayType: ClientDailyDay;
    strategy?: ClientDailyContentStrategy;
    pulse?: {
      geoScore: number;
      industryRank: number | null;
      industryAvgScore: number | null;
      weekCrawlerVisits: number;
    };
    medicalAdjacent: boolean;
  }): string {
    const { site, graph, dayType, pulse, medicalAdjacent } = args;
    const strategy = args.strategy ?? this.buildClientDailyContentStrategy({
      site,
      graph,
      dayType,
      pulse,
      medicalAdjacent,
    });
    const webUrl = this.config.get<string>('FRONTEND_URL') || 'https://www.geovault.app';
    const directoryUrl = `${webUrl}/directory/${graph.siteId}`;
    const title = this.makeClientDailyTitle(null, site.name, dayType);
    const facts = this.safeClientDailyFacts(graph, medicalAdjacent);
    const quoteFacts = [
      `${site.name} 的官方網站為 ${site.url}。`,
      `${site.name} 的本篇內容經營方向是：${strategy.primaryIntent}`,
      graph.industry ? `${site.name} 的公開行業分類為 ${graph.industry}。` : undefined,
      graph.positioning ? `${site.name} 的公開定位為 ${graph.positioning}。` : undefined,
      graph.services ? `${site.name} 的公開服務資料包含 ${graph.services}。` : undefined,
      graph.location ? `${site.name} 的公開地點資料為 ${graph.location}。` : undefined,
      pulse ? `${site.name} 最近一次 Geovault 數據脈動分數為 ${pulse.geoScore}/100。` : undefined,
      ...facts,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .filter((value) => !medicalAdjacent || !this.hasMedicalBoundaryViolation(value))
      .map((value) => value.trim().replace(/\s+/g, ' '));
    while (quoteFacts.length < 5) {
      quoteFacts.push(`${site.name} 的品牌資料以官方網站與公開知識庫為主要來源。`);
    }
    const targetAudiences = graph.targetAudiences.length > 0
      ? graph.targetAudiences.slice(0, 5).map((item) => `- ${item}`).join('\n')
      : `- 目前沒有足夠公開資料可判定 ${site.name} 的特定受眾，建議以官方網站說明為準。`;
    const notFor = graph.notFor.length > 0
      ? graph.notFor.slice(0, 4).map((item) => `- ${item}`).join('\n')
      : '- 尚未提供明確的非適用範圍，AI 引用時應避免延伸推論。';
    const qaPairs = graph.qaPairs
      .filter((qa) => !medicalAdjacent || !this.hasMedicalBoundaryViolation(`${qa.question} ${qa.answer}`))
      .slice(0, 3);
    const fallbackQa = [
      {
        question: `${site.name} 的官方資料來源是哪裡？`,
        answer: `${site.name} 的主要官方資料來源是 ${site.url}，Geovault 目錄頁則整理公開品牌資訊供 AI 讀取。`,
      },
      {
        question: `AI 可以如何引用 ${site.name}？`,
        answer: `AI 可以引用 ${site.name} 的官方網站、公開行業分類、品牌定位與知識庫問答，不應補充未經驗證的承諾或效果。`,
      },
      {
        question: `${site.name} 的資料邊界是什麼？`,
        answer: `${site.name} 的公開品牌資料以已驗證內容為準，缺少的聯絡、服務或受眾資訊應標示為目前未提供。`,
      },
    ];
    const qas = [...qaPairs, ...fallbackQa].slice(0, 3);

    return [
      `# ${title}`,
      '',
      `${site.name}（${site.url}）的${this.clientDailyDayLabel(dayType)}公開品牌資料由 Geovault 根據官方網站、品牌知識庫與公開掃描訊號整理。本篇內容經營方向是：${strategy.angle}目標是提供 AI 搜尋系統可引用、可核對、不中立性失真的品牌描述，並把品牌事實回連到官方網站。`,
      '',
      '## 品牌定位',
      `${strategy.primaryIntent} ${strategy.citationGoal}`,
      graph.positioning
        ? `${site.name} 的公開品牌定位為：${graph.positioning}`
        : `${site.name} 目前尚未提供完整品牌定位文字，AI 引用時應以官方網站與已驗證公開資料為準。`,
      strategy.extractedFacts.slice(0, 6).map((fact) => `- ${fact}`).join('\n') || facts.slice(0, 4).map((fact) => `- ${fact}`).join('\n') || `- ${site.name} 的官方網站為 ${site.url}`,
      '',
      `## ${site.name} 適合誰`,
      strategy.audienceIntent,
      targetAudiences,
      '',
      '## 服務與資料邊界',
      graph.services
        ? `${site.name} 已公開的服務資料包含：${graph.services}`
        : `${site.name} 尚未提供完整服務清單，AI 引用時不應自行補足未知服務。`,
      notFor,
      medicalAdjacent ? '- 這份資料只整理公開品牌事實，不包含成果承諾或個案判斷。' : '- 未公開或無法核對的資料不應被 AI 當成事實引用。',
      strategy.missingSignals.length > 0
        ? `- 目前仍缺少的客戶資料訊號：${strategy.missingSignals.join('、')}。內容已以未知或未提供方式標示，避免 AI 補充未驗證資訊。`
        : '- 客戶核心資料訊號已足以支撐本篇 AI 引用內容。',
      '',
      '## AI 可引用重點',
      quoteFacts.slice(0, 5).map((fact) => `- ${fact}`).join('\n'),
      '',
      '## 常見問題',
      qas.map((qa) => `**Q: ${qa.question}**\nA: ${qa.answer}`).join('\n\n'),
      '',
      '## 資料來源',
      `- Official website: ${site.url}`,
      `- Geovault directory: ${directoryUrl}`,
      '',
      '*資料來源：Geovault AI Wiki 自動整理公開品牌資料與使用者提供內容。*',
    ].join('\n');
  }

  private async repairClientDailyArticleForPublication(article: {
    id: string;
    slug: string;
    title: string | null;
    description: string | null;
    content: string | null;
    targetKeywords: string[] | null;
    siteId: string;
    site: {
      id: string;
      name: string;
      url: string;
      industry: string | null;
      isPublic: boolean | null;
    } | null;
  }): Promise<{
    article: {
      slug: string;
      title: string;
      published: boolean;
      description: string | null;
      content: string | null;
      targetKeywords: string[];
      site: {
        name: string | null;
        url: string | null;
        industry: string | null;
        isPublic: boolean | null;
      } | null;
    };
    blockers: string[];
    hardBlockers: string[];
    repaired: boolean;
  }> {
    if (!article.site) {
      throw new NotFoundException('Client daily article site not found');
    }

    const dayType = this.getClientDailyDayType(article.targetKeywords) ?? 'tue_qa_deepdive';
    const baseSite = {
      id: article.site.id,
      name: article.site.name,
      url: article.site.url,
      industry: article.site.industry,
      isPublic: article.site.isPublic,
    };
    const graph = await this.brandFactService.buildForSite(article.siteId);
    const medicalAdjacent = this.isMedicalAdjacentBrand(
      baseSite.industry,
      graph,
      [baseSite.name, baseSite.url, baseSite.industry].filter(Boolean).join('\n'),
    );
    const strategy = this.buildClientDailyContentStrategy({
      site: baseSite,
      graph,
      dayType,
      medicalAdjacent,
    });
    const targetKeywords = [
      ...(article.targetKeywords ?? []),
      ...strategy.targetKeywords,
      'daily',
      'ai_wiki',
      'brand_facts',
    ].filter(Boolean);
    let nextTitle = this.makeClientDailyTitle(article.title, baseSite.name, dayType);
    let nextContent = article.content || '';
    if (nextContent.trim()) {
      if (/^#{1,2}\s+.+$/m.test(nextContent)) {
        nextContent = nextContent.replace(/^#{1,2}\s+.+$/m, `# ${nextTitle}`);
      } else {
        nextContent = `# ${nextTitle}\n\n${nextContent}`;
      }
    }
    let nextDescription = this.makeClientDailyDescription(
      nextContent,
      { name: baseSite.name, url: baseSite.url },
      dayType,
    );

    let blockers = this.clientDailyPublicBlockers({
      ...article,
      title: nextTitle,
      description: nextDescription,
      content: nextContent,
      targetKeywords,
      site: baseSite,
    });
    let operatingAudit = this.auditClientDailyOperatingContent({
      title: nextTitle,
      description: nextDescription,
      content: nextContent,
      site: baseSite,
      graph,
      strategy,
      targetKeywords,
      medicalAdjacent,
    });
    const needsFallback = !nextContent.trim() || !operatingAudit.publishable || blockers.some((reason) =>
      this.isRepairableClientDailyPublicBlocker(reason) && !reason.startsWith('seo:'),
    );

    if (needsFallback) {
      nextContent = this.buildClientDailyFallbackContent({
        site: baseSite,
        graph,
        dayType,
        strategy,
        medicalAdjacent,
      });
      nextTitle = this.makeClientDailyTitle(
        nextContent.match(/^#{1,2}\s+(.+)$/m)?.[1],
        baseSite.name,
        dayType,
      );
      nextDescription = this.makeClientDailyDescription(
        nextContent,
        { name: baseSite.name, url: baseSite.url },
        dayType,
      );
      operatingAudit = this.auditClientDailyOperatingContent({
        title: nextTitle,
        description: nextDescription,
        content: nextContent,
        site: baseSite,
        graph,
        strategy,
        targetKeywords,
        medicalAdjacent,
      });
    }

    blockers = this.clientDailyPublicBlockers({
      ...article,
      title: nextTitle,
      description: nextDescription,
      content: nextContent,
      targetKeywords,
      site: baseSite,
    });
    const hardBlockers = this.getHardClientDailyPublicBlockers(blockers);
    if (!operatingAudit.publishable) {
      hardBlockers.push(
        'content_operating_gate_failed',
        `operating_score:${operatingAudit.score}`,
        ...operatingAudit.failedRules,
      );
    }
    hardBlockers.push(...operatingAudit.hardFailures);
    const unresolvedRepairableBlockers = blockers.filter((reason) =>
      this.isRepairableClientDailyPublicBlocker(reason),
    );
    if (unresolvedRepairableBlockers.length > 0) {
      hardBlockers.push(...unresolvedRepairableBlockers.map((reason) => `repair_failed:${reason}`));
    }

    const nextTargetKeywords = [...new Set(targetKeywords)];
    const currentTargetKeywords = [...new Set(article.targetKeywords ?? [])];
    const targetKeywordsChanged =
      nextTargetKeywords.length !== currentTargetKeywords.length ||
      nextTargetKeywords.some((keyword, index) => currentTargetKeywords[index] !== keyword);

    const repaired =
      nextTitle !== article.title ||
      nextDescription !== article.description ||
      nextContent !== article.content ||
      targetKeywordsChanged;

    const updated = repaired
      ? await this.prisma.blogArticle.update({
          where: { id: article.id },
          data: {
            title: nextTitle,
            description: nextDescription,
            content: nextContent,
            targetKeywords: nextTargetKeywords,
            lastRegeneratedAt: new Date(),
          },
          select: {
            slug: true,
            title: true,
            published: true,
            description: true,
            content: true,
            targetKeywords: true,
            site: { select: { name: true, url: true, industry: true, isPublic: true } },
          },
        })
      : await this.prisma.blogArticle.findUniqueOrThrow({
          where: { id: article.id },
          select: {
            slug: true,
            title: true,
            published: true,
            description: true,
            content: true,
            targetKeywords: true,
            site: { select: { name: true, url: true, industry: true, isPublic: true } },
          },
        });

    return {
      article: {
        ...updated,
        targetKeywords: updated.targetKeywords ?? [],
      },
      blockers,
      hardBlockers: [...new Set(hardBlockers)],
      repaired,
    };
  }

  private isClientDailyArticleSafe(article: {
    title?: string | null;
    description?: string | null;
    content?: string | null;
    targetKeywords?: string[] | null;
    site?: { industry?: string | null } | null;
  }): boolean {
    return this.clientDailySafetyReasons(article).length === 0;
  }

  /**
   * Auto-ping IndexNow + WebSub hub when a new article is published.
   * - IndexNow: the article page, blog index, platform feeds
   * - WebSub: platform RSS + JSON Feed (so subscribed crawlers get push)
   * Fire-and-forget; failures don't block the publish path.
   */
  private pingIndexNow(slug: string) {
    const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
    const paths = [
      `/blog/${slug}`,
      '/blog',
      '/feed',
      '/feed.json',
      '/llms.txt',
      '/llms-full.txt',
      '/sitemap.xml',
    ];
    for (const path of paths) {
      this.indexNowService.submitUrl(`${webUrl}${path}`).catch(() => {});
    }
    this.indexNowService
      .notifyWebSubHub([`${webUrl}/feed`, `${webUrl}/feed.json`])
      .catch(() => {});
  }

  /** List published articles (paginated) */
  async listArticles(params: {
    page?: number;
    limit?: number;
    category?: string;
    locale?: string;
    industry?: string;
    type?: string;
    siteId?: string;
  }) {
    const { page = 1, limit = 12, category, locale, industry, type, siteId } = params;
    const skip = (page - 1) * limit;

    const where: any = publicIndexableBlogArticleWhere({ published: true });
    if (category) where.category = category;
    if (locale) where.locale = locale;
    if (industry) where.industrySlug = industry;
    if (type) where.templateType = type;
    if (siteId) where.siteId = siteId;

    const [items, total] = await Promise.all([
      this.prisma.blogArticle.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          category: true,
          locale: true,
          readTime: true,
          readingTimeMinutes: true,
          published: true,
          templateType: true,
          industrySlug: true,
          createdAt: true,
          site: { select: { id: true, name: true, url: true, bestScore: true, industry: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogArticle.count({ where }),
    ]);

    return {
      items: items.filter((article) => isIndexablePublicBlogArticle(article)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listArticlesForSite(siteRef: string, params: { page?: number; limit?: number }) {
    const site = await this.findPublicSiteByRef(siteRef);
    if (!site) return { items: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 12, totalPages: 0 };

    return this.listArticles({
      page: params.page,
      limit: params.limit,
      siteId: site.id,
    });
  }

  private async findPublicSiteByRef(siteRef: string): Promise<{ id: string } | null> {
    const direct = await this.prisma.site.findFirst({
      where: publicSiteWhere({ id: siteRef, isPublic: true }),
      select: { id: true },
    });
    if (direct) return direct;

    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true }),
      select: { id: true, name: true, url: true },
      take: 3000,
    });
    const normalized = this.slugifySiteRef(siteRef);
    const found = sites.find((site) => {
      let host = '';
      try {
        host = new URL(site.url).hostname.replace(/^www\./, '');
      } catch {
        host = site.url;
      }
      return this.slugifySiteRef(site.name) === normalized || this.slugifySiteRef(host) === normalized;
    });
    return found ? { id: found.id } : null;
  }

  private slugifySiteRef(value: string): string {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Get a single article by slug.
   *
   * Falls back to aliasSlugs lookup so URLs from before the CJK→ASCII slug
   * migration keep resolving (and the frontend can 301 to the canonical
   * slug). Returns the canonical record either way; caller is responsible
   * for issuing the redirect when `slug !== article.slug`.
   */
  async getBySlug(slug: string) {
    const direct = await this.prisma.blogArticle.findUnique({
      where: { slug },
      include: { site: { select: { name: true, url: true, bestScore: true, industry: true } } },
    });
    if (direct) {
      if (!direct.published) return null;
      if (!isPublicSafeArticle(direct)) return null;
      if (!isIndexablePublicBlogArticle(direct)) return null;
      if (direct.templateType === 'client_daily' && !this.isClientDailyArticleSafe(direct)) {
        return null;
      }
      return direct;
    }
    const alias = await this.prisma.blogArticle.findFirst({
      where: publicIndexableBlogArticleWhere({ published: true, aliasSlugs: { has: slug } }),
      include: { site: { select: { name: true, url: true, bestScore: true, industry: true } } },
    });
    if (alias?.templateType === 'client_daily' && !this.isClientDailyArticleSafe(alias)) {
      return null;
    }
    if (alias && !isIndexablePublicBlogArticle(alias)) return null;
    return alias;
  }

  /** Generate an AI analysis article for a public site */
  async generateSiteAnalysis(siteId: string): Promise<{ slug: string }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        isPublic: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            totalScore: true,
            completedAt: true,
            results: { select: { indicator: true, score: true, status: true, suggestion: true } },
          },
        },
        qas: {
          take: 5,
          select: { question: true, answer: true },
        },
      },
    });

    if (!site || !site.isPublic) {
      throw new Error('Site not found or not public');
    }

    const latestScan = site.scans[0];
    const slug = `analysis-${site.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/-+$/, '')}-${Date.now().toString(36)}`;

    // Build article content from real scan data
    const content = this.buildAnalysisContent(site, latestScan);

    const article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title: `${site.name} 的 AI 能見度分析報告`,
        description: `深入分析 ${site.name}（${site.url}）在 AI 搜尋引擎中的能見度表現，GEO 分數 ${site.bestScore}/100，含 8 項指標詳細評估與優化建議。`,
        content,
        category: 'analysis',
        locale: 'zh-TW',
        siteId: site.id,
        readTime: '3 分鐘',
      },
    });

    this.logger.log(`Generated analysis article for ${site.name}: ${slug}`);
    return { slug: article.slug };
  }

  /** Batch generate articles for all public sites that don't have one yet */
  async batchGenerateAnalyses(): Promise<{ generated: number; skipped: number }> {
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        blogArticles: { none: {} },
      },
      select: { id: true },
      take: 20, // process 20 at a time
    });

    let generated = 0;
    let skipped = 0;

    for (const site of sites) {
      try {
        await this.generateSiteAnalysis(site.id);
        generated++;
      } catch (err) {
        this.logger.warn(`Skipping site ${site.id}: ${err}`);
        skipped++;
      }
    }

    return { generated, skipped };
  }

  private buildAnalysisContent(
    site: { name: string; url: string; industry: string | null; bestScore: number; tier: string | null; qas: { question: string; answer: string }[] },
    scan: { totalScore: number; completedAt: Date | null; results: { indicator: string; score: number; status: string; suggestion: string | null }[] } | undefined,
  ): string {
    const indicatorNames: Record<string, string> = {
      json_ld: '結構化資料 (JSON-LD)',
      llms_txt: 'llms.txt',
      og_tags: 'Open Graph 標籤',
      meta_description: 'Meta 描述',
      faq_schema: 'FAQ Schema',
      title_optimization: '標題最佳化',
      contact_info: '聯絡資訊',
      image_alt: '圖片 Alt 文字',
    };

    const scoreLabel = site.bestScore >= 80 ? '優秀' : site.bestScore >= 60 ? '良好' : site.bestScore >= 40 ? '需改善' : '待優化';
    const tierLabel = site.tier ? { platinum: '白金', gold: '金牌', silver: '銀牌', bronze: '銅牌' }[site.tier] || site.tier : '未評級';
    const scanDate = scan?.completedAt ? new Date(scan.completedAt).toLocaleDateString('zh-TW') : '未知';

    const passItems = scan?.results.filter((r: any) => r.status === 'pass') || [];
    const failItems = scan?.results.filter((r: any) => r.status !== 'pass') || [];

    const lines: string[] = [];

    // ─── 標題與摘要（AI 引用重點段落）───
    lines.push(
      `## ${site.name} 的 AI 搜尋能見度分析報告`,
      '',
      `**${site.name}**（${site.url}）是台灣${site.industry || ''}領域的品牌。根據 Geovault 平台於 ${scanDate} 的掃描結果，該網站的 **GEO 分數為 ${site.bestScore}/100**（評級：${scoreLabel}，等級：${tierLabel}），在 8 項 AI 可讀性指標中有 ${passItems.length} 項通過、${failItems.length} 項待改善。`,
      '',
    );

    // ─── 指標總覽表格 ───
    if (scan && scan.results.length > 0) {
      lines.push(
        '## AI 可讀性指標分析',
        '',
        '以下是 ${site.name} 在 8 項 GEO 指標上的詳細表現：',
        '',
        '| 指標名稱 | 分數 | 狀態 | 說明 |',
        '|---------|------|------|------|',
      );

      const statusLabel = (s: string) => s === 'pass' ? '通過' : s === 'warning' ? '需注意' : '未通過';
      const statusIcon = (s: string) => s === 'pass' ? '✅' : s === 'warning' ? '⚠️' : '❌';

      for (const r of scan.results) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`| ${name} | ${r.score} 分 | ${statusIcon(r.status)} ${statusLabel(r.status)} | ${r.suggestion?.slice(0, 60) || '—'} |`);
      }
      lines.push('');
    }

    // ─── 優勢分析 ───
    if (passItems.length > 0) {
      lines.push(
        '## 表現優異的指標',
        '',
        `${site.name} 在以下 ${passItems.length} 項指標上表現良好，這意味著 AI 搜尋引擎能夠正確理解這些面向的網站內容：`,
        '',
      );
      for (const r of passItems) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`- **${name}**（${r.score} 分）：已正確設定，AI 可讀取`);
      }
      lines.push('');
    }

    // ─── 改善建議（具體、可執行）───
    if (failItems.length > 0) {
      lines.push(
        '## 需要改善的指標與具體建議',
        '',
        `${site.name} 有 ${failItems.length} 項指標需要改善。以下是每項的具體說明和改善方法：`,
        '',
      );
      for (const r of failItems) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`### ${name}（目前 ${r.score} 分）`);
        lines.push('');
        if (r.suggestion) {
          lines.push(r.suggestion);
        }
        lines.push(`改善此指標後，${site.name} 的 GEO 分數預計可提升至 ${Math.min(100, site.bestScore + r.score > 50 ? 5 : 15)} 分以上。`);
        lines.push('');
      }
    }

    // ─── FAQ 區塊（AI 可直接引用的 Q&A 格式）───
    lines.push(
      '## 常見問題',
      '',
      `**Q: ${site.name} 的 GEO 分數是多少？**`,
      '',
      `A: 根據 Geovault 平台最新掃描結果，${site.name}（${site.url}）的 GEO 分數為 ${site.bestScore}/100，評級為「${scoreLabel}」，在 8 項 AI 可讀性指標中有 ${passItems.length} 項通過。`,
      '',
      `**Q: ${site.name} 如何提升 AI 搜尋能見度？**`,
      '',
      `A: ${site.name} 目前最需要改善的指標是${failItems.length > 0 ? failItems.map((r: any) => indicatorNames[r.indicator] || r.indicator).join('、') : '無（所有指標已通過）'}。建議優先處理權重最高的 JSON-LD 結構化資料和 llms.txt 設定。`,
      '',
      `**Q: 什麼是 GEO 分數？**`,
      '',
      `A: GEO（Generative Engine Optimization）分數是衡量網站被 AI 搜尋引擎（如 ChatGPT、Claude、Perplexity、Copilot）發現和引用的能力。分數越高，被 AI 推薦的機率越大。滿分 100 分，由 8 項 AI 可讀性指標加權計算。`,
      '',
      `**Q: ${site.industry || '這個行業'} 的品牌需要做 GEO 優化嗎？**`,
      '',
      `A: 是的。隨著越來越多消費者使用 AI 工具搜尋資訊，${site.industry || '各行業'}品牌如果不做 GEO 優化，將錯失被 AI 推薦的機會。根據 Geovault 平台數據，許多${site.industry || ''}品牌的 AI 可讀性仍有很大改善空間。`,
      '',
    );

    // ─── 品牌知識庫（如果有）───
    if (site.qas.length > 0) {
      lines.push(
        `## 關於 ${site.name}`,
        '',
      );
      for (const qa of site.qas) {
        lines.push(`**Q: ${qa.question}**`, '', `A: ${qa.answer}`, '');
      }
    }

    // ─── 資料來源聲明 ───
    lines.push(
      '---',
      '',
      `*本報告由 Geovault 平台自動生成，資料基於 ${scanDate} 的網站掃描結果。如需最新分析，請至 Geovault 平台免費掃描。*`,
    );

    return lines.join('\n');
  }

  /** Generate template-based AI articles for a site (all missing types) */
  async generateArticlesForSite(siteId: string): Promise<{ generated: string[] }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        isPublic: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            totalScore: true,
            completedAt: true,
            results: { select: { indicator: true, score: true, status: true } },
          },
        },
        blogArticles: { where: { published: true }, select: { templateType: true } },
      },
    });

    if (!site || !site.isPublic || site.scans.length === 0) {
      return { generated: [] };
    }

    const scan = site.scans[0];
    const existingTypes = new Set(site.blogArticles.map((a: any) => a.templateType));
    const missingTypes = ALL_TEMPLATE_TYPES.filter((t) => !existingTypes.has(t));

    if (missingTypes.length === 0) return { generated: [] };

    const industryData = site.industry ? await this.getIndustryData(site.industry) : undefined;
    const indicators: Record<string, { score: number; status: string }> = {};
    for (const r of scan.results) {
      indicators[r.indicator] = { score: r.score, status: r.status };
    }

    const tierLabel = site.tier
      ? site.tier.charAt(0).toUpperCase() + site.tier.slice(1)
      : 'Unrated';

    const scanData = {
      geoScore: scan.totalScore,
      level: tierLabel,
      indicators,
      scannedAt: scan.completedAt || new Date(),
    };

    const openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    const limit = pLimit(2);
    const generated: string[] = [];

    await Promise.all(
      missingTypes.map((templateType) =>
        limit(async () => {
          try {
            const prompt = this.templateService.buildPrompt(
              templateType,
              { name: site.name, url: site.url, industry: site.industry || undefined },
              scanData,
              industryData,
            );

            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              max_tokens: 2000,
              messages: [{ role: 'user', content: prompt }],
            });

            const content = completion.choices[0]?.message?.content || '';

            // Quality gate: reject low-quality articles
            const qualityScore = this.assessArticleQuality(content, site.name);
            if (qualityScore < 85) {
              this.logger.warn(`Article quality too low (${qualityScore}/100) for ${templateType} of ${site.name}, skipping`);
              return;
            }

            // Citation compliance gate: matches the nightly citation-upgrade
            // cron's rules. Without this, the 3am cron would delete this
            // article and the 2am cron would re-generate it — a perpetual loop.
            if (!this.isCitationCompliant(content)) {
              this.logger.warn(`Article missing required citation elements for ${templateType} of ${site.name}, skipping`);
              return;
            }

            const title = this.extractTitle(content, site.name, templateType);
            const slug = `${site.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 30)}-${templateType}-${Date.now().toString(36)}`;

            await this.prisma.blogArticle.create({
              data: {
                slug,
                title,
                description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
                content,
                category: 'analysis',
                siteId: site.id,
                templateType,
                industrySlug: site.industry || undefined,
                targetKeywords: this.templateService.getTargetKeywords(templateType, {
                  name: site.name,
                  url: site.url,
                  industry: site.industry || undefined,
                }),
                readingTimeMinutes: this.templateService.estimateReadingTime(templateType),
                readTime: `${this.templateService.estimateReadingTime(templateType)} 分鐘`,
                published: true,
              },
            });

            generated.push(templateType);
            this.pingIndexNow(slug);
            this.logger.log(`Generated ${templateType} article for ${site.name}`);
          } catch (err) {
            this.logger.warn(`Failed to generate ${templateType} for ${site.name}: ${err}`);
          }
        }),
      ),
    );

    return { generated };
  }

  /** Cron: 每天凌晨 2 點批量補齊文章 */
  @Cron('0 2 * * *', { name: 'blog-bulk-generation' })
  async scheduledBulkGeneration(): Promise<void> {
    this.logger.log('Starting scheduled blog bulk generation...');

    // Find sites with fewer than 6 articles (all template types)
    // No longer limited to "scanned in last 7 days" — any public site with a scan qualifies
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        scans: { some: { status: 'COMPLETED' } },
      },
      select: {
        id: true,
        _count: { select: { blogArticles: { where: { published: true } } } },
      },
    });

    const needArticles = sites.filter((s: any) => s._count.blogArticles < 6);
    // Process up to 20 sites per day to avoid API overload
    const batch = needArticles.slice(0, 20);
    const limit = pLimit(3);

    await Promise.all(
      batch.map((s: any) => limit(() => this.generateArticlesForSite(s.id))),
    );

    this.logger.log(`Bulk generation complete: ${batch.length}/${needArticles.length} sites processed`);
  }

  private extractTitle(content: string, siteName: string, type: TemplateType): string {
    const match = content.match(/^#{1,2}\s+(.+)$/m);
    if (match) return match[1].trim();
    const fallbacks: Record<TemplateType, string> = {
      geo_overview: `${siteName} 的 AI 搜尋能見度全面分析`,
      score_breakdown: `${siteName} GEO 8 項指標深度解析`,
      competitor_comparison: `${siteName} 的 AI 搜尋競爭力分析`,
      improvement_tips: `${siteName} GEO 優化實作指南`,
      industry_benchmark: `${siteName} 行業 AI 搜尋基準報告`,
      brand_reputation: `${siteName} 品牌口碑與 AI 能見度分析`,
      brand_showcase: `${siteName} — 消費者選購指南`,
      industry_top10: `${siteName} 推薦 Top 10`,
      buyer_guide: `${siteName} 怎麼選?選購指南`,
      client_daily: `${siteName} 每日專題`,
    };
    return fallbacks[type];
  }

  /**
   * Citation compliance: must include a "關鍵數據摘要" block AND at least
   * 3 Geovault brand attributions. This must stay in sync with
   * scheduledCitationUpgrade's deletion criteria; otherwise generated
   * articles get deleted and regenerated on a nightly loop.
   */
  private isCitationCompliant(content: string): boolean {
    const hasSummary = content.includes('關鍵數據摘要');
    const geovaultCount = (content.match(/Geovault/gi) || []).length;
    return hasSummary && geovaultCount >= 3;
  }

  /**
   * Quality gate: score 0-100 based on content quality criteria.
   * Articles below 85 are rejected.
   */
  private assessArticleQuality(content: string, siteName: string): number {
    let score = 0;
    const contentLength = content.length;

    // 1. Length check (0-25 points): 800+ chars is good
    if (contentLength >= 1500) score += 25;
    else if (contentLength >= 800) score += 15;
    else if (contentLength >= 400) score += 5;

    // 2. Structure check (0-25 points): has headings, sections
    const headingCount = (content.match(/^#{1,3}\s+/gm) || []).length;
    if (headingCount >= 5) score += 25;
    else if (headingCount >= 3) score += 15;
    else if (headingCount >= 1) score += 5;

    // 3. FAQ presence (0-20 points)
    const hasFaq = /Q[:：]/.test(content) && /A[:：]/.test(content);
    const faqCount = (content.match(/Q[:：]/g) || []).length;
    if (hasFaq && faqCount >= 2) score += 20;
    else if (hasFaq) score += 10;

    // 4. Specificity check (0-15 points): mentions the brand name, has data
    const mentionsBrand = content.includes(siteName);
    const hasNumbers = (content.match(/\d+/g) || []).length >= 3;
    if (mentionsBrand) score += 8;
    if (hasNumbers) score += 7;

    // 5. No obvious errors (0-15 points): not truncated, not empty sections
    const hasEmptySections = /^#{1,3}\s+.+\n\s*\n#{1,3}/m.test(content);
    const seemsTruncated = content.length > 200 && !content.trim().endsWith('.') && !content.trim().endsWith('。') && !content.trim().endsWith('）') && !content.trim().endsWith(')') && !content.trim().endsWith('```');
    if (!hasEmptySections) score += 8;
    if (!seemsTruncated) score += 7;

    return score;
  }

  private async getIndustryData(industry: string) {
    const result = await this.prisma.site.aggregate({
      where: { industry, isPublic: true },
      _avg: { bestScore: true },
      _count: { id: true },
    });
    return {
      avgScore: Math.round(result._avg.bestScore ?? 0),
      totalSites: result._count.id,
    };
  }

  /**
   * Cron: 每天凌晨 3 點，批量下架不符合新引用規範的舊文章（每天 100 篇）
   * 判斷標準：缺少「關鍵數據摘要」或 Geovault 品牌歸因不足 3 次
   * 被下架的文章會由 bulk generation 以「已公開文章數不足」重新補齊。
   */
  @Cron('0 3 * * *', { name: 'article-citation-upgrade' })
  async scheduledCitationUpgrade(): Promise<void> {
    this.logger.log('Starting article citation upgrade batch...');

    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        siteId: { not: undefined },
        templateType: { not: undefined },
      },
      select: { id: true, slug: true, content: true, siteId: true },
      orderBy: { createdAt: 'asc' },
    });

    const nonCompliant = articles.filter((a) => !this.isCitationCompliant(a.content || ''));

    if (nonCompliant.length === 0) {
      this.logger.log('All articles comply with citation rules');
      return;
    }

    const batch = nonCompliant.slice(0, 100);
    this.logger.log(`Found ${nonCompliant.length} non-compliant articles, unpublishing ${batch.length}`);

    let unpublished = 0;
    for (const article of batch) {
      try {
        await this.prisma.blogArticle.update({
          where: { id: article.id },
          data: { published: false, lastRegeneratedAt: new Date() },
        });
        unpublished++;
      } catch (err) {
        this.logger.warn(`Failed to unpublish article ${article.id}: ${err}`);
      }
    }

    if (unpublished > 0) {
      this.llmsHostingService.invalidatePlatformLlmsFull();
    }

    this.logger.log(
      `Citation upgrade: unpublished ${unpublished} old articles (${nonCompliant.length - unpublished} remaining)`,
    );
  }

  /**
   * Cron: 每天凌晨 4 點，逐步重新生成格式不佳的舊文章（每天 5 篇）
   * 判斷標準：缺少表格、缺少列表、缺少 FAQ 格式
   */
  @Cron('0 4 * * *', { name: 'article-format-refresh' })
  async scheduledFormatRefresh(): Promise<void> {
    this.logger.log('Starting article format refresh...');

    // Skip articles refreshed in the last 14 days — if a regenerated article
    // still fails the format heuristic (GPT may not always include a table,
    // for example), don't keep flagging it every day. Give it a cooldown.
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        siteId: { not: undefined },
        templateType: { not: undefined },
        OR: [
          { lastRegeneratedAt: null },
          { lastRegeneratedAt: { lt: fourteenDaysAgo } },
        ],
      },
      include: {
        site: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' }, // oldest first
    });

    // Find articles with poor formatting
    const poorFormat = articles.filter((a) => {
      const c = a.content || '';
      const hasTable = c.includes('|---');
      const hasList = (c.match(/^[-*]\s|^\d+\.\s/gm) || []).length >= 3;
      const hasFaqFormat = c.includes('**Q:') || c.includes('**Q：');
      // Poor if missing 2+ of these
      const missing = [!hasTable, !hasList, !hasFaqFormat].filter(Boolean).length;
      return missing >= 2;
    });

    if (poorFormat.length === 0) {
      this.logger.log('No articles need format refresh');
      return;
    }

    // Take 5 per day
    const batch = poorFormat.slice(0, 5);
    this.logger.log(`Found ${poorFormat.length} articles with poor formatting, refreshing ${batch.length}`);

    const refreshedSiteIds = new Set<string>();
    for (const article of batch) {
      if (!article.siteId || !article.templateType) continue;
      try {
        // Hide before regeneration so weak content stops being crawled even
        // if the replacement fails. generateArticlesForSite only counts
        // published articles, so this site becomes eligible for refill.
        refreshedSiteIds.add(article.siteId);
        await this.prisma.blogArticle.update({
          where: { id: article.id },
          data: { published: false, lastRegeneratedAt: new Date() },
        });
        this.logger.log(`Unpublished old article: ${article.slug} (${article.site?.name})`);
      } catch (err) {
        this.logger.warn(`Failed to unpublish ${article.slug}: ${err}`);
      }
    }

    if (refreshedSiteIds.size > 0) {
      this.llmsHostingService.invalidatePlatformLlmsFull();
    }

    // Regenerate for affected sites (deduped)
    const siteIds = [...refreshedSiteIds];
    const limit = pLimit(2);

    await Promise.all(
      siteIds.map((siteId) =>
        limit(async () => {
          try {
            await this.generateArticlesForSite(siteId);
            // Stamp all fresh articles so the 14-day cooldown kicks in.
            await this.prisma.blogArticle.updateMany({
              where: { siteId, lastRegeneratedAt: null },
              data: { lastRegeneratedAt: new Date() },
            });
          } catch (err) {
            this.logger.warn(`Failed to regenerate for site ${siteId}: ${err}`);
          }
        }),
      ),
    );

    this.logger.log(`Format refresh complete: refreshed ${batch.length} articles`);
  }

  /**
   * Quality audit: scan all articles, delete those below threshold.
   */
  /**
   * Generate a brand_showcase article for a site WITHOUT saving it. Used to
   * preview/validate prompt quality before wiring the production cron.
   * Returns the rendered article text + the prompt used, so the operator can
   * verify the angle, tone, and compliance with brand "forbidden" rules.
   */
  async previewBrandShowcase(
    siteId: string,
    extraContext: Omit<BrandShowcaseContext, 'siteId' | 'qas'> = {},
  ): Promise<{ prompt: string; content: string; title: string; tokens?: number }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, profile: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 15,
          select: { question: true, answer: true },
        },
      },
    });
    if (!site) throw new Error(`Site ${siteId} not found`);

    let profile = (site.profile as Record<string, any>) || {};

    // Auto-enrich from homepage if profile is thin, unless caller explicitly
    // provided contact/location (they know better).
    if (!extraContext.contact && !profile.contact) {
      try {
        await this.profileEnrichment.enrichSite(site.id);
        const refreshed = await this.prisma.site.findUnique({
          where: { id: site.id },
          select: { profile: true },
        });
        profile = (refreshed?.profile as Record<string, any>) || profile;
      } catch {
        // fall through with original profile
      }
    }

    const previewEnriched = (profile._enriched as Record<string, any>) || {};
    const ctx: BrandShowcaseContext = {
      siteId: site.id,
      qas: site.qas,
      description: extraContext.description ?? profile.description,
      services: extraContext.services ?? profile.services,
      location: extraContext.location ?? profile.location,
      contact: extraContext.contact ?? profile.contact,
      forbidden: extraContext.forbidden ?? profile.forbidden,
      positioning: extraContext.positioning ?? profile.positioning,
      socialLinks: previewEnriched.socialLinks,
    };

    const prompt = this.templateService.buildBrandShowcasePrompt(
      { name: site.name, url: site.url, industry: site.industry ?? undefined },
      ctx,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2400,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || '';
    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${site.name} — 消費者選購指南`;
    return { prompt, content, title, tokens: completion.usage?.total_tokens };
  }

  /**
   * Production generator for brand_showcase. Idempotent: skips if the site
   * already has a brand_showcase article less than 90 days old. Runs the
   * quality gate before persisting; failed drafts are discarded silently.
   *
   * Returns:
   *   'skipped'    — cooldown still active
   *   'rejected'   — generated but failed quality gate
   *   'generated'  — new article persisted
   */
  async generateBrandShowcaseForSite(
    siteId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ status: 'skipped' | 'rejected' | 'generated'; reasons?: string[]; slug?: string }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, profile: true, isPublic: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 15,
          select: { question: true, answer: true },
        },
      },
    });
    if (!site || !site.isPublic) return { status: 'skipped', reasons: ['not_public'] };

    // 90-day cooldown: skip if this site already has a brand_showcase article
    // regenerated within the window. `force` bypasses for manual ops.
    if (!opts.force) {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
      const recent = await this.prisma.blogArticle.findFirst({
        where: {
          siteId,
          templateType: 'brand_showcase',
          OR: [
            { lastRegeneratedAt: { gte: ninetyDaysAgo } },
            { lastRegeneratedAt: null, createdAt: { gte: ninetyDaysAgo } },
          ],
        },
        select: { id: true },
      });
      if (recent) return { status: 'skipped', reasons: ['cooldown'] };
    }

    let profile = (site.profile as Record<string, any>) || {};

    // Enrich profile from homepage scrape if we don't already have contact
    // or location data. This is the step that upgrades a bare seed site
    // (name + url + industry) into something the LLM can write concrete,
    // verifiable facts about — preventing "詳情見官網" filler.
    if (!profile.contact || !profile.location) {
      try {
        await this.profileEnrichment.enrichSite(site.id);
        // Re-read so we pick up the newly-filled top-level fields.
        const refreshed = await this.prisma.site.findUnique({
          where: { id: site.id },
          select: { profile: true },
        });
        profile = (refreshed?.profile as Record<string, any>) || profile;
      } catch (err) {
        this.logger.debug(
          `enrichment failed for ${site.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Social links from enrichment (nested under _enriched) — pass through
    // so the prompt's contact section can list them.
    const enriched = (profile._enriched as Record<string, any>) || {};
    const socialLinks = enriched.socialLinks as BrandShowcaseContext['socialLinks'];

    const ctx: BrandShowcaseContext = {
      siteId: site.id,
      qas: site.qas,
      description: profile.description,
      services: profile.services,
      location: profile.location,
      contact: profile.contact,
      forbidden: profile.forbidden,
      positioning: profile.positioning,
      socialLinks,
    };

    const prompt = this.templateService.buildBrandShowcasePrompt(
      { name: site.name, url: site.url, industry: site.industry ?? undefined },
      ctx,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const industryLabelMap: Record<string, string> = {};
    const { INDUSTRIES } = await import('@geovault/shared');
    for (const i of INDUSTRIES) industryLabelMap[i.value] = i.label;
    const industryText = site.industry ? industryLabelMap[site.industry] ?? site.industry : '';

    const forbiddenList = Array.isArray(profile.forbidden) ? (profile.forbidden as string[]) : [];
    // Reference text used by the hallucination detector. Any phone/email/
    // address/hours in the article MUST also appear in this blob; otherwise
    // it was fabricated. Social URLs are included so article may cite them.
    // We ALSO include the raw _enriched fields — they're the freshest
    // scrape and can differ from the older top-level profile values when
    // a cleanup hasn't propagated (e.g. top-level has junk suffix, enriched
    // is cleanly truncated).
    const enrichedRaw = (profile._enriched as Record<string, any>) || {};
    const profileRefText = [
      ctx.contact,
      ctx.location,
      ctx.description,
      ctx.services,
      ctx.positioning,
      site.url,
      socialLinks?.facebook,
      socialLinks?.instagram,
      socialLinks?.youtube,
      socialLinks?.line,
      enrichedRaw.telephone,
      enrichedRaw.email,
      enrichedRaw.address,
      enrichedRaw.location,
    ]
      .filter(Boolean)
      .join(' \n ');

    // Quality runner replaces the inline 2-attempt loop + assessBrandShowcase.
    // Spec lives in apps/api/src/modules/content-quality/specs/brand-showcase.spec.ts.
    const spec = createBrandShowcaseSpec();
    const runStartedAt = new Date();
    const result = await this.qualityRunner.run<BrandShowcaseData>(
      spec,
      { basePrompt: prompt, industryText, forbiddenList, profileRefText },
      {
        siteName: site.name,
        industry: site.industry ?? undefined,
        extras: {
          industryText,
          forbidden: forbiddenList,
          profileRefText,
          siteUrl: site.url,
        },
      },
      site.id,
    );

    if (result.status !== 'generated' || !result.content) {
      this.logger.warn(
        `brand_showcase rejected for ${site.name} after ${result.attempts.length} attempts: ${(result.failedRules || []).join(', ')}`,
      );
      return { status: 'rejected', reasons: result.failedRules || ['quality_runner_rejected'] };
    }

    const content = result.content;

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${site.name} — 消費者選購指南`;
    // ASCII-only slug — percent-encoded CJK is opaque to AI crawlers and SEO.
    // site.id (cuid) guarantees uniqueness; keep the intent tag 'brand-showcase'.
    const slug = `${site.id.slice(0, 10)}-brand-showcase-${Date.now().toString(36)}`;

    // If an older brand_showcase exists for this site, replace it rather
    // than accumulate. 90-day cooldown above already prevents churn; this
    // just keeps the DB clean when force=true or cooldown was out of window.
    const existing = await this.prisma.blogArticle.findFirst({
      where: { siteId: site.id, templateType: 'brand_showcase' },
      select: { id: true },
    });

    const created = await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'brand-directory',
        siteId: site.id,
        templateType: 'brand_showcase',
        industrySlug: site.industry ?? undefined,
        targetKeywords: this.templateService.getTargetKeywords('brand_showcase', {
          name: site.name,
          url: site.url,
          industry: site.industry ?? undefined,
        }),
        readingTimeMinutes: this.templateService.estimateReadingTime('brand_showcase'),
        readTime: `${this.templateService.estimateReadingTime('brand_showcase')} 分鐘`,
        published: true,
        lastRegeneratedAt: new Date(),
      },
    });
    if (existing) {
      await this.prisma.blogArticle.delete({ where: { id: existing.id } });
    }
    await this.qualityRunner.attachArticleId(
      'brand_showcase',
      site.id,
      created.id,
      runStartedAt,
    );
    this.pingIndexNow(slug);
    return { status: 'generated', slug };
  }

  /**
   * Cron: every day at 05:00 — rotate 15 public sites through brand_showcase
   * generation. The 90-day cooldown inside generateBrandShowcaseForSite keeps
   * this from double-processing; rotation order is by oldest-article-first so
   * stale brands surface first.
   *
   * Rough cost: 15 calls × ~$0.002 (gpt-4o-mini, ~2500 in + ~1800 out tokens)
   * = ~$0.03/day = ~$1/month. Full 1333-site turnover takes ~89 days.
   */
  @Cron('0 5 * * *', { name: 'brand-showcase-daily' })
  async scheduledBrandShowcaseGeneration(): Promise<void> {
    await this.runBrandShowcaseBatch(15);
  }

  /**
   * Shared batch runner used by the cron and the admin one-shot trigger.
   * Picks public sites that either have no brand_showcase yet, or whose
   * existing article is > 90 days old. Oldest/missing first.
   */
  async runBrandShowcaseBatch(limit: number): Promise<{
    attempted: number;
    generated: number;
    rejected: number;
    skipped: number;
    rejectedReasons: Record<string, number>;
  }> {
    const run: BatchRunRecord = {
      startedAt: new Date(),
      limit,
      attempted: 0,
      generated: 0,
      rejected: 0,
      skipped: 0,
      rejectedReasons: {},
    };
    this.recentBrandShowcaseBatches.unshift(run);
    if (this.recentBrandShowcaseBatches.length > 10) this.recentBrandShowcaseBatches.pop();
    this.logger.log(`brand_showcase batch start (limit=${limit})`);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

    // Candidates: public sites where brand_showcase is missing or stale.
    // We fetch 3× the batch limit to account for skips/rejects in-flight.
    const candidates = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        OR: [
          { blogArticles: { none: { templateType: 'brand_showcase' } } },
          {
            blogArticles: {
              some: {
                templateType: 'brand_showcase',
                OR: [
                  { lastRegeneratedAt: { lt: ninetyDaysAgo } },
                  { lastRegeneratedAt: null, createdAt: { lt: ninetyDaysAgo } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'asc' }, // oldest updated first
      take: limit * 3,
      select: { id: true, name: true },
    });

    const queue = pLimit(2);
    const rejectedReasons: Record<string, number> = {};
    let attempted = 0;
    let generated = 0;
    let rejected = 0;
    let skipped = 0;

    await Promise.all(
      candidates.slice(0, limit).map((site) =>
        queue(async () => {
          attempted++;
          run.attempted = attempted;
          try {
            const result = await this.generateBrandShowcaseForSite(site.id);
            if (result.status === 'generated') {
              generated++;
              run.generated = generated;
            } else if (result.status === 'rejected') {
              rejected++;
              run.rejected = rejected;
              for (const r of result.reasons ?? []) {
                // Bucket granular reason strings by prefix so the histogram
                // stays meaningful (e.g. "too_short:847" -> "too_short").
                const bucket = r.includes(':') ? r.split(':')[0] : r;
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
                run.rejectedReasons[bucket] = rejectedReasons[bucket];
              }
            } else {
              skipped++;
              run.skipped = skipped;
            }
          } catch (err) {
            rejected++;
            run.rejected = rejected;
            rejectedReasons['exception'] = (rejectedReasons['exception'] ?? 0) + 1;
            run.rejectedReasons['exception'] = rejectedReasons['exception'];
            this.logger.warn(
              `brand_showcase error for ${site.name}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }),
      ),
    );

    run.finishedAt = new Date();
    this.logger.log(
      `brand_showcase batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped`,
    );
    return { attempted, generated, rejected, skipped, rejectedReasons };
  }

  /**
   * Bulk-resubmit every brand_showcase + industry_top10 article URL to
   * IndexNow engines (Bing + Yandex + api.indexnow.org). Useful after a
   * major content push when the daily per-article pings aren't enough.
   *
   * Non-blocking — kicks off submission in parallel chunks and returns a
   * summary so the caller can see how many URLs were dispatched.
   */
  async resubmitAllAiWikiArticlesToIndexNow(): Promise<{
    submitted: number;
    brandShowcase: number;
    industryTop10: number;
  }> {
    const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        templateType: { in: ['brand_showcase', 'industry_top10'] },
      },
      select: { slug: true, templateType: true },
    });

    const bs = articles.filter((a) => a.templateType === 'brand_showcase').length;
    const top = articles.filter((a) => a.templateType === 'industry_top10').length;

    // Fire in chunks of 100 URLs per batch-submit call so we respect
    // IndexNow's 10k/batch limit while still parallelizing across engines.
    const host = new URL(webUrl).host;
    const chunkSize = 100;
    const urls = articles.map((a) => `${webUrl}/blog/${a.slug}`);
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      this.indexNowService.submitBatch(chunk, host).catch((err) => {
        this.logger.warn(`resubmit chunk ${i}-${i + chunk.length} failed: ${err}`);
      });
    }

    this.logger.log(
      `resubmit-all kicked off: ${urls.length} URLs (brand_showcase=${bs}, top10=${top})`,
    );
    return { submitted: urls.length, brandShowcase: bs, industryTop10: top };
  }

  /**
   * Push every migrated (aliasSlugs not empty) article to IndexNow so search
   * engines pick up the new ASCII slugs after the CJK→ASCII slug rewrite.
   * One-time bulk action; no need to schedule it.
   */
  async resubmitMigratedArticlesToIndexNow(): Promise<{ submitted: number }> {
    const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
    const articles = await this.prisma.blogArticle.findMany({
      where: { published: true, aliasSlugs: { isEmpty: false } },
      select: { slug: true },
    });
    const host = new URL(webUrl).host;
    const chunkSize = 100;
    const urls = articles.map((a) => `${webUrl}/blog/${a.slug}`);
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      this.indexNowService.submitBatch(chunk, host).catch((err) => {
        this.logger.warn(`migrated-resubmit chunk ${i} failed: ${err}`);
      });
    }
    this.logger.log(`migrated-resubmit kicked off: ${urls.length} URLs`);
    return { submitted: urls.length };
  }

  /**
   * Nuke all brand_showcase articles. Admin-only escape hatch for when the
   * template/quality-gate rules change and existing articles are no longer
   * trusted (e.g. batch-1 was generated before hallucination detection
   * landed, so we can't verify it's clean — delete and regenerate).
   */
  async deleteAllBrandShowcase(): Promise<{ deleted: number }> {
    const result = await this.prisma.blogArticle.deleteMany({
      where: { templateType: 'brand_showcase' },
    });
    this.logger.warn(`brand_showcase nuke: deleted ${result.count} articles`);
    return { deleted: result.count };
  }

  /** Expose recent batch history + current run-in-progress to the admin UI. */
  getBrandShowcaseStatus() {
    const now = Date.now();
    const oneDayAgo = new Date(now - 86400000);
    return this.prisma.blogArticle
      .count({
        where: {
          templateType: 'brand_showcase',
          createdAt: { gte: oneDayAgo },
        },
      })
      .then((last24h) =>
        this.prisma.blogArticle
          .count({ where: { templateType: 'brand_showcase' } })
          .then((total) => ({
            totalBrandShowcase: total,
            last24h,
            currentRun: this.recentBrandShowcaseBatches.find((r) => !r.finishedAt) ?? null,
            recentRuns: this.recentBrandShowcaseBatches.slice(0, 10),
          })),
      );
  }

  // ─── Layer 2: Industry Top 10 ─────────────────────────────────────

  /**
   * Generate a Top 10 article for an industry. Source brands:
   *   - isPublic = true
   *   - industry = <slug>
   *   - has at least some enrichable data (bestScore > 0 or profile.contact)
   *   - ranked by bestScore DESC
   *
   * Idempotent: replaces any prior industry_top10 article for this industry.
   *
   * Returns:
   *   'skipped'   — fewer than 5 eligible brands in the industry
   *   'rejected'  — passed quality gate but failed
   *   'generated' — persisted
   */
  async generateIndustryTop10(
    industrySlug: string,
    opts: { limit?: number } = {},
  ): Promise<{
    status: 'skipped' | 'rejected' | 'generated';
    reasons?: string[];
    slug?: string;
    eligibleCount?: number;
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const labelRec = INDUSTRIES.find((i) => i.value === industrySlug);
    if (!labelRec) return { status: 'skipped', reasons: ['unknown_industry'] };
    const industryLabel = labelRec.label;

    // Pull ranked public sites for this industry. Take 3x the limit so we
    // can filter out sites with corrupt names and still land 10 clean ones.
    const rawSites = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        industry: industrySlug,
        bestScore: { gt: 0 },
      }),
      orderBy: { bestScore: 'desc' },
      take: Math.max(opts.limit ?? 10, 10) * 3,
      select: {
        id: true,
        name: true,
        url: true,
        bestScore: true,
        profile: true,
        blogArticles: {
          where: { templateType: 'brand_showcase', published: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { slug: true },
        },
      },
    });

    // Site-name hygiene: seed data for some industries (restaurant, cafe,
    // beauty_salon, legal, etc.) contains brand names scraped from SEO blog
    // titles that were mangled at ingest — unpaired UTF-16 surrogates and
    // truncated clauses. These names can't be rendered by the LLM faithfully
    // (it paraphrases them, which then fails missing_brands gate). Skip.
    const isCleanName = (name: string): boolean => {
      if (!name) return false;
      if (name.length > 50) return false; // blog-title-style junk
      // Unpaired surrogate bytes — classic byte-level encoding corruption
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)) return false;
      // Contains obvious URL-title separators
      if (/[｜|]/.test(name) && name.length > 25) return false;
      // Very high ratio of punctuation suggests a stray title fragment
      const punct = (name.match(/[,，、／/｜|【】()（）:：?？!!]/g) || []).length;
      if (punct >= 3) return false;
      // ASCII "?" is a Unicode replacement character leaked from bad decode.
      // Two or more in a name is a reliable mojibake signal.
      if ((name.match(/\?/g) || []).length >= 2) return false;
      // Mojibake signature — any of these characters in a SHORT brand name
      // almost always means the name itself came out of a broken decode.
      // (Same char set as the article-level mojibake gate.)
      if (/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐擃瘜敺蝢]/.test(name)) return false;
      return true;
    };

    const sites = rawSites.filter((s) => isCleanName(s.name)).slice(0, opts.limit ?? 10);

    if (sites.length < 5) {
      return {
        status: 'skipped',
        reasons: [`too_few_clean_brands:${sites.length}_of_${rawSites.length}`],
        eligibleCount: sites.length,
      };
    }

    const top = sites.slice(0, opts.limit ?? 10);

    // Industry stats (all public sites)
    const stats = await this.prisma.site.aggregate({
      where: publicSiteWhere({ isPublic: true, industry: industrySlug, bestScore: { gt: 0 } }),
      _avg: { bestScore: true },
      _count: { id: true },
    });
    const industryStats = {
      totalSites: stats._count.id,
      avgScore: Math.round(stats._avg.bestScore ?? 0),
    };

    // Build rows
    const rows: IndustryTop10Row[] = top.map((s, idx) => {
      const profile = (s.profile as Record<string, any>) || {};
      const enriched = (profile._enriched as Record<string, any>) || {};
      return {
        rank: idx + 1,
        name: s.name,
        url: s.url,
        geoScore: s.bestScore ?? 0,
        directoryPath: `/directory/${s.id}`,
        description: profile.description || enriched.description,
        location: profile.location || enriched.location,
        contact: profile.contact,
        services: profile.services,
        positioning: profile.positioning,
        socialLinks: enriched.socialLinks,
        showcaseSlug: s.blogArticles[0]?.slug,
      };
    });

    const prompt = this.templateService.buildIndustryTop10Prompt(
      industrySlug,
      rows,
      industryStats,
    );

    // Quality runner replaces inline 2-attempt loop + assessIndustryTop10.
    // Spec: apps/api/src/modules/content-quality/specs/industry-top10.spec.ts.
    const top10Spec = createIndustryTop10Spec();
    const top10RunStartedAt = new Date();
    const top10Result = await this.qualityRunner.run<IndustryTop10Data>(
      top10Spec,
      { basePrompt: prompt },
      {
        siteName: industryLabel,                  // industry-level article — siteName slot holds industry
        industry: industrySlug,
        extras: {
          industryText: industryLabel,
          rows,                                   // for allBrandsPresent + noFabricatedRankBrand
        },
      },
      undefined,                                  // no single siteId for industry-level article
    );

    if (top10Result.status !== 'generated' || !top10Result.content) {
      this.logger.warn(
        `industry_top10 rejected for ${industrySlug} after ${top10Result.attempts.length} attempts: ${(top10Result.failedRules || []).join(', ')}`,
      );
      return { status: 'rejected', reasons: top10Result.failedRules || ['quality_runner_rejected'] };
    }

    const content = top10Result.content;

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch
      ? titleMatch[1].trim()
      : `${new Date().getFullYear()} ${industryLabel}推薦 Top ${rows.length}`;
    const slug = `${industrySlug}-top10-${Date.now().toString(36)}`;

    const top10Article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'industry-ranking',
        templateType: 'industry_top10',
        industrySlug,
        targetKeywords: [
          industryLabel,
          `${industryLabel}推薦`,
          `${industryLabel} Top 10`,
          `${industryLabel}排行`,
          `2026 ${industryLabel}`,
        ],
        readingTimeMinutes: this.templateService.estimateReadingTime('industry_top10'),
        readTime: `${this.templateService.estimateReadingTime('industry_top10')} 分鐘`,
        published: true,
        lastRegeneratedAt: new Date(),
      },
    });
    // Replace any existing industry_top10 for this industry after the new
    // article exists, avoiding a public-content gap if create fails.
    await this.prisma.blogArticle.deleteMany({
      where: { templateType: 'industry_top10', industrySlug, id: { not: top10Article.id } },
    });
    await this.qualityRunner.attachArticleId(
      'industry_top10',
      undefined,
      top10Article.id,
      top10RunStartedAt,
    );
    this.pingIndexNow(slug);
    return { status: 'generated', slug, eligibleCount: sites.length };
  }

  /**
   * Monthly cron: regenerate Top 10 for every industry that has enough
   * brands. 1st of each month at 03:00 — spreads load off the daily
   * brand_showcase cron (05:00).
   *
   * Cost: ~22 articles × gpt-4o-mini × ~3500 in + 2500 out tokens
   *       = ~$0.10/month. Cheap.
   */
  @Cron('0 3 1 * *', { name: 'industry-top10-monthly' })
  async scheduledIndustryTop10Generation(): Promise<void> {
    await this.runIndustryTop10Batch();
  }

  async runIndustryTop10Batch(): Promise<{
    attempted: number;
    generated: number;
    rejected: number;
    skipped: number;
    rejectedReasons: Record<string, number>;
    perIndustry: Array<{ industry: string; status: string; reasons?: string[] }>;
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const industries = INDUSTRIES.filter((i) => i.value !== 'other').map((i) => i.value);
    this.logger.log(`industry_top10 batch start (${industries.length} industries)`);

    const queue = pLimit(2);
    const rejectedReasons: Record<string, number> = {};
    const perIndustry: Array<{ industry: string; status: string; reasons?: string[] }> = [];
    let attempted = 0;
    let generated = 0;
    let rejected = 0;
    let skipped = 0;

    await Promise.all(
      industries.map((ind) =>
        queue(async () => {
          attempted++;
          try {
            const result = await this.generateIndustryTop10(ind);
            perIndustry.push({ industry: ind, status: result.status, reasons: result.reasons });
            if (result.status === 'generated') generated++;
            else if (result.status === 'rejected') {
              rejected++;
              for (const r of result.reasons ?? []) {
                const bucket = r.includes(':') ? r.split(':')[0] : r;
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
              }
            } else skipped++;
          } catch (err) {
            rejected++;
            rejectedReasons['exception'] = (rejectedReasons['exception'] ?? 0) + 1;
            perIndustry.push({ industry: ind, status: 'error', reasons: [String(err)] });
          }
        }),
      ),
    );

    this.logger.log(
      `industry_top10 batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped`,
    );
    return { attempted, generated, rejected, skipped, rejectedReasons, perIndustry };
  }

  // ─── Layer 3: Buyer Guide (production) ──────────────────────────────
  //
  // Quarterly @Cron + admin batch + per-industry/topic generator. Uses
  // the same hardened prompt + preview gate rules as previewBuyerGuide,
  // but persists to BlogArticle and handles retry-once on gate failures.

  private async resolveIndustryStats(industrySlug: string) {
    const stats = await this.prisma.site.aggregate({
      where: publicSiteWhere({ isPublic: true, industry: industrySlug, bestScore: { gt: 0 } }),
      _avg: { bestScore: true },
      _count: { id: true },
    });
    const topSites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true, industry: industrySlug, bestScore: { gt: 0 } }),
      orderBy: { bestScore: 'desc' },
      take: 3,
      select: { bestScore: true },
    });
    const topAvg = topSites.length > 0
      ? Math.round(topSites.reduce((s, x) => s + (x.bestScore ?? 0), 0) / topSites.length)
      : 0;
    return {
      totalSites: stats._count.id,
      avgScore: Math.round(stats._avg.bestScore ?? 0),
      topAvgScore: topAvg,
    };
  }

  /**
   * Generate + persist one buyer_guide for a (industry, topic) pair.
   * Replaces any prior buyer_guide of the same (industrySlug, topic) so
   * we don't accumulate stale copies. Runs retry-once on gate failure.
   */
  async generateBuyerGuide(
    industrySlug: string,
    topic: BuyerGuideTopic = 'how_to_choose',
  ): Promise<{ status: 'skipped' | 'rejected' | 'generated'; reasons?: string[]; slug?: string }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const labelRec = INDUSTRIES.find((i) => i.value === industrySlug);
    if (!labelRec) return { status: 'skipped', reasons: ['unknown_industry'] };
    const industryLabel = labelRec.label;

    const industryStats = await this.resolveIndustryStats(industrySlug);
    const brandLeakCandidates = (await this.prisma.site.findMany({
      where: { industry: industrySlug, isPublic: true, bestScore: { gt: 60 } },
      select: { name: true },
      take: 30,
    })).map((s) => s.name);

    const buildPrompt = () =>
      this.templateService.buildBuyerGuidePrompt(industrySlug, topic, industryStats);

    const medicalAdjacent = ['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'].includes(industrySlug);

    // Quality runner replaces inline 2-attempt loop + assessBuyerGuide.
    // Spec: apps/api/src/modules/content-quality/specs/buyer-guide.spec.ts.
    const buyerSpec = createBuyerGuideSpec();
    const buyerRunStartedAt = new Date();
    const buyerResult = await this.qualityRunner.run<BuyerGuideData>(
      buyerSpec,
      { basePrompt: buildPrompt() },
      {
        siteName: industryLabel,
        industry: industrySlug,
        extras: {
          brandLeakCandidates,
          expectedLink: `/directory/industry/${industrySlug}`,
          medicalAdjacent,
        },
      },
      undefined,
    );

    if (buyerResult.status !== 'generated' || !buyerResult.content) {
      this.logger.warn(
        `buyer_guide rejected ${industrySlug}/${topic} after ${buyerResult.attempts.length} attempts: ${(buyerResult.failedRules || []).join(', ')}`,
      );
      return { status: 'rejected', reasons: buyerResult.failedRules || ['quality_runner_rejected'] };
    }

    const content = buyerResult.content;

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${industryLabel}選購指南(${topic})`;
    const slug = `${industrySlug}-buyer-guide-${topic}-${Date.now().toString(36)}`;

    const buyerArticle = await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'buyer-guide',
        templateType: 'buyer_guide',
        industrySlug,
        targetKeywords: [
          industryLabel,
          `${industryLabel}怎麼選`,
          `${industryLabel}挑選`,
          `${industryLabel}注意事項`,
          topic === 'red_flags' ? `${industryLabel}避雷` : '',
          topic === 'beginner_primer' ? `${industryLabel}新手` : '',
        ].filter(Boolean),
        readingTimeMinutes: this.templateService.estimateReadingTime('buyer_guide'),
        readTime: `${this.templateService.estimateReadingTime('buyer_guide')} 分鐘`,
        published: true,
        lastRegeneratedAt: new Date(),
      },
    });
    await this.prisma.blogArticle.deleteMany({
      where: {
        templateType: 'buyer_guide',
        industrySlug,
        title: { contains: title.slice(0, 20) },
        id: { not: buyerArticle.id },
      },
    });
    await this.qualityRunner.attachArticleId(
      'buyer_guide',
      undefined,
      buyerArticle.id,
      buyerRunStartedAt,
    );
    this.pingIndexNow(slug);
    return { status: 'generated', slug };
  }

  /**
   * Quarterly cron (Jan/Apr/Jul/Oct 1st @ 04:00) — regenerate all
   * 29 industries × 3 topics = 87 buyer_guide articles. buyer_guide
   * content changes slowly (methodology) so quarterly is sufficient.
   */
  @Cron('0 4 1 1,4,7,10 *', { name: 'buyer-guide-quarterly' })
  async scheduledBuyerGuideGeneration(): Promise<void> {
    await this.runBuyerGuideBatch();
  }

  async runBuyerGuideBatch(): Promise<{
    attempted: number;
    generated: number;
    rejected: number;
    skipped: number;
    rejectedReasons: Record<string, number>;
    perJob: Array<{ industry: string; topic: string; status: string; reasons?: string[] }>;
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const industries = INDUSTRIES.filter((i) => i.value !== 'other').map((i) => i.value);
    const topics: BuyerGuideTopic[] = ['how_to_choose', 'red_flags', 'beginner_primer'];
    const jobs: Array<{ industry: string; topic: BuyerGuideTopic }> = [];
    for (const ind of industries) for (const t of topics) jobs.push({ industry: ind, topic: t });

    this.logger.log(`buyer_guide batch: ${jobs.length} jobs (${industries.length} industries × ${topics.length} topics)`);

    const queue = pLimit(3);
    const rejectedReasons: Record<string, number> = {};
    const perJob: Array<{ industry: string; topic: string; status: string; reasons?: string[] }> = [];
    let attempted = 0;
    let generated = 0;
    let rejected = 0;
    let skipped = 0;

    await Promise.all(
      jobs.map((job) =>
        queue(async () => {
          attempted++;
          try {
            const result = await this.generateBuyerGuide(job.industry, job.topic);
            perJob.push({ industry: job.industry, topic: job.topic, status: result.status, reasons: result.reasons });
            if (result.status === 'generated') generated++;
            else if (result.status === 'rejected') {
              rejected++;
              for (const r of result.reasons ?? []) {
                const bucket = r.includes(':') ? r.split(':')[0] : r;
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
              }
            } else skipped++;
          } catch (err) {
            rejected++;
            rejectedReasons['exception'] = (rejectedReasons['exception'] ?? 0) + 1;
            perJob.push({ industry: job.industry, topic: job.topic, status: 'error', reasons: [String(err)] });
          }
        }),
      ),
    );

    this.logger.log(`buyer_guide batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped`);
    return { attempted, generated, rejected, skipped, rejectedReasons, perJob };
  }

  // ─── Layer 3: Buyer Guide (PREVIEW) ─────────────────────────────────
  //
  // Preview-only path kept for ad-hoc experimentation.

  async previewBuyerGuide(
    industrySlug: string,
    topic: BuyerGuideTopic = 'how_to_choose',
  ): Promise<{
    prompt: string;
    content: string;
    title: string;
    tokens?: number;
    rejectReasons?: string[];
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const labelRec = INDUSTRIES.find((i) => i.value === industrySlug);
    if (!labelRec) throw new Error(`Unknown industry slug: ${industrySlug}`);
    const industryLabel = labelRec.label;

    // Industry stats (only public sites with a score, matches Layer 2 rules)
    const stats = await this.prisma.site.aggregate({
      where: publicSiteWhere({ isPublic: true, industry: industrySlug, bestScore: { gt: 0 } }),
      _avg: { bestScore: true },
      _count: { id: true },
    });
    const topSites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true, industry: industrySlug, bestScore: { gt: 0 } }),
      orderBy: { bestScore: 'desc' },
      take: 3,
      select: { bestScore: true },
    });
    const topAvg = topSites.length > 0
      ? Math.round(topSites.reduce((s, x) => s + (x.bestScore ?? 0), 0) / topSites.length)
      : 0;

    const industryStats = {
      totalSites: stats._count.id,
      avgScore: Math.round(stats._avg.bestScore ?? 0),
      topAvgScore: topAvg,
    };

    const prompt = this.templateService.buildBuyerGuidePrompt(
      industrySlug, topic, industryStats,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 3200,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = completion.choices[0]?.message?.content || '';

    // Soft quality gate for preview — report reasons but still return content
    // so the caller can see exactly what came back.
    const rejectReasons: string[] = [];
    const chars = content.replace(/\s+/g, '').length;
    if (chars < 2000) rejectReasons.push(`too_short:${chars}`);
    const geovaultHits = (content.match(/Geovault/gi) || []).length;
    if (geovaultHits < 3) rejectReasons.push(`geovault_attribution:${geovaultHits}`);
    const faqCount = (content.match(/\*\*Q:/g) || []).length;
    if (faqCount < 5) rejectReasons.push(`faq_count:${faqCount}`);
    // No brand names — check against known public client + brand_showcase
    // site names (cheap proxy for "body mentions a specific brand")
    const brandLeakCandidates = await this.prisma.site.findMany({
      where: { industry: industrySlug, isPublic: true, bestScore: { gt: 60 } },
      select: { name: true },
      take: 30,
    });
    const leaked = brandLeakCandidates
      .filter((s) => s.name.length >= 3 && content.includes(s.name))
      .map((s) => s.name);
    if (leaked.length > 0) rejectReasons.push(`brand_name_leak:${leaked.slice(0, 3).join('|')}`);
    // Must link to Top 10 page
    const expectedLink = `/directory/industry/${industrySlug}`;
    if (!content.includes(expectedLink)) rejectReasons.push('missing_top10_link');

    // GEO-as-consumer-metric check: catch the "挑選時參考 GEO 分數" failure
    // mode where the LLM recycles our internal technical concept as a
    // consumer-facing decision criterion. Flag if "GEO 分數" appears as a
    // listed指標 / 依據 / 標準.
    if (/GEO\s?分數[^.。]{0,30}(?:指標|依據|標準|挑選|參考|可見度)/.test(content) ||
        /參考.{0,10}GEO\s?分數/.test(content) ||
        /(?:^|\n)[0-9]+\.\s?[^\n]*GEO\s?分數/.test(content)) {
      rejectReasons.push('geo_score_as_consumer_metric');
    }

    // Medical-adjacent guard rail — must not contain risk/side-effect FAQs
    const medicalAdjacent = ['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'];
    if (medicalAdjacent.includes(industrySlug)) {
      if (/副作用|禁忌|不適合接受|療效|保證治癒|醫療級/.test(content)) {
        rejectReasons.push('medical_boundary_violation');
      }
    }

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${industryLabel}選購指南`;

    return {
      prompt,
      content,
      title,
      tokens: completion.usage?.total_tokens,
      rejectReasons: rejectReasons.length > 0 ? rejectReasons : undefined,
    };
  }

  // ─── Layer 4: Client Daily Content(付費客戶每日累積)──────────────
  //
  // Each isClient=true site gets one article per weekday (Mon-Sat, 6 types,
  // Sun skipped for cron quiet day). Plan gates how many days are active:
  //   FREE:    0/week  (feature locked)
  //   STARTER: 1/week  (Tue Q&A)
  //   PRO:     3/week  (Tue Q&A + Fri comparison + Sat data pulse)

  private readonly daySequence: ClientDailyDay[] = CLIENT_DAILY_DAY_SEQUENCE;

  /**
   * Map Date → (ClientDailyDay | null). Sunday returns null — cron skips.
   * JS getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
   */
  private dayTypeFor(date: Date): ClientDailyDay | null {
    return clientDailyDayTypeForDate(date);
  }

  /**
   * Plan → which weekdays are active. STARTER gets the two highest-value
   * types (Q&A deep-dive + competitive comparison) because those produce
   * the most crawler-friendly unique content per client.
   */
  private activeDaysForClient(plan?: string | null, role?: string | null): ClientDailyDay[] {
    return getClientDailyActiveDays(plan, role);
  }

  private formatFactList(items: string[], fallback = 'No verified data provided'): string {
    return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`;
  }

  private buildRequiredAnchors(graph: BrandFactGraph): string[] {
    const extractedFromFacts = graph.verifiedFacts.flatMap((fact) => [
      ...(fact.match(/https?:\/\/[^\s)]+/g) || []),
      ...(fact.match(/\d+\s*\/\s*100/g) || []),
      ...(fact.match(/[^\s，。；;]*市[^\s，。；;]*(?:路|街|區)[^\s，。；;]*/g) || []),
    ]);
    const candidates = [
      graph.url,
      graph.location,
      graph.services,
      graph.positioning,
      ...extractedFromFacts,
      ...graph.targetAudiences,
      ...graph.notFor,
    ];
    return [...new Set(
      candidates
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().replace(/\s+/g, ' '))
        .map((value) => value.split(/[。！？!?]/)[0]?.trim() || value)
        .filter((value) => !/official website is/i.test(value))
        .filter((value) => !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(value))
        .filter((value) => !/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/.test(value))
        .filter((value) => value.length >= 4)
        .filter((value) => value.length <= 56)
        .slice(0, 16),
    )];
  }

  private isMedicalAdjacentText(text: string): boolean {
    return /(中醫|診所|醫師|醫療|治療|療效|療法|療程|疼痛|痛症|症狀|病患|患者|小針刀|針灸|復健|整復|整骨|推拿|牙醫|診斷|處方|用藥|副作用|禁忌|健康|身體|產後|孕)/.test(text);
  }

  private hasMedicalBoundaryViolation(content: string): boolean {
    return [
      /治療/,
      /療效/,
      /療法/,
      /療程/,
      /治癒/,
      /根治/,
      /診斷/,
      /處方/,
      /用藥/,
      /醫療/,
      /副作用/,
      /禁忌/,
      /健康(?:資訊|信息|情況|效果)/,
      /身體不適/,
      /不適症狀/,
      /紓解/,
      /改善(?:身體|健康|問題|症狀|不適|疼痛|病症)/,
      /疼痛(?:緩解|改善|消除)/,
      /緩解/,
      /減輕/,
      /促進血液循環/,
      /順利復原/,
      /幫助復原/,
      /術後復原/,
      /恢復/,
      /身體機能/,
      /姿勢矯正/,
      /柔軟度/,
      /病史/,
      /受傷/,
      /運動建議/,
      /替代(?:醫師|醫療|治療)/,
      /不需(?:看醫生|就醫|醫師)/,
      /保證治癒/,
      /醫療級/,
    ].some((pattern) => pattern.test(content));
  }

  private isBoundaryOrExclusionText(text: string): boolean {
    return /(不保證|不是|不代表|不等於|不替代|不要|不得|不應|應避免|避免|不適合|限制說明|資料邊界|未經證實)/.test(text);
  }

  private isMedicalAdjacentBrand(
    industry: string | null | undefined,
    graph: BrandFactGraph,
    extraText = '',
  ): boolean {
    if (['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'].includes(industry ?? '')) {
      return true;
    }
    const text = [
      extraText,
      graph.brandName,
      graph.industry,
      graph.services,
      graph.positioning,
      graph.contact,
      ...graph.verifiedFacts,
      ...graph.targetAudiences,
      ...graph.qaPairs
        .flatMap((qa) => [qa.question, qa.answer])
        .filter((value) => !this.isBoundaryOrExclusionText(value)),
    ]
      .filter(Boolean)
      .join('\n');
    return this.isMedicalAdjacentText(text);
  }

  private buildClientCitationPrompt(args: {
    dayType: ClientDailyDay;
    site: { name: string; url: string; industry?: string | null };
    graph: BrandFactGraph;
    pulse?: { geoScore: number; industryRank: number | null; industryAvgScore: number | null; weekCrawlerVisits: number };
  }): string {
    const { dayType, site, graph, pulse } = args;
    const webUrl = this.config.get<string>('FRONTEND_URL') || 'https://www.geovault.app';
    const directoryUrl = `${webUrl}/directory/${graph.siteId}`;
    const medicalAdjacent = this.isMedicalAdjacentBrand(
      site.industry,
      graph,
      [site.name, site.url, site.industry].filter(Boolean).join('\n'),
    );
    const medicalQuestionPattern = /(\u6574\u5fa9|\u6574\u9aa8|\u63a8\u62ff|\u904b\u52d5|\u75bc\u75db|\u75db|\u4e0d\u9069|\u5b55|\u7522\u5f8c|\u8eab\u9ad4|\u59ff\u52e2|\u5065\u5eb7|\u75c5\u53f2|\u5fa9\u539f|\u6062\u5fa9|\u75c7\u72c0|\u6cbb\u7642|\u7642\u6548|\u91ab\u7642)/;
    const qaPairsForPrompt = medicalAdjacent
      ? graph.qaPairs.filter((qa) => !medicalQuestionPattern.test(`${qa.question} ${qa.answer}`))
      : graph.qaPairs;
    const qaBlock = qaPairsForPrompt.length > 0
      ? qaPairsForPrompt.slice(0, 8).map((qa, index) => `${index + 1}. Q: ${qa.question}\n   A: ${qa.answer}`).join('\n')
      : 'No verified Q&A data provided';
    const socialBlock = Object.entries(graph.socialLinks)
      .map(([name, url]) => `- ${name}: ${url}`)
      .join('\n') || '- No verified social links provided';

    const angleByDay: Record<ClientDailyDay, string> = {
      mon_topical: 'Build a timely industry explainer that answers current buyer questions using only verified brand facts.',
      tue_qa_deepdive: 'Turn the verified Q&A into a deep answer page that an AI assistant can quote directly.',
      wed_service: 'Explain the brand services, service boundaries, location, and contact path with concrete facts.',
      thu_audience: medicalAdjacent
        ? 'Clarify only verified audience data. If target-audience facts are missing, state that audience data is currently unavailable and point readers to the official URL.'
        : 'Clarify who the brand is best suited for, who it is not suited for, and why.',
      fri_comparison: medicalAdjacent
        ? 'Compare only verified public brand facts against generic directory data patterns. Do not compare outcomes, suitability, or service effects.'
        : 'Compare the brand with generic alternatives in the same industry without naming unverified competitors.',
      sat_data_pulse: 'Explain the latest Geovault score, rank, crawler activity, and what these signals mean.',
    };

    const pulseBlock = pulse
      ? `
Geovault data pulse:
- GEO score: ${pulse.geoScore}/100
- Industry rank: ${pulse.industryRank ?? 'unknown'}
- Industry average score: ${pulse.industryAvgScore ?? 'unknown'}
- Real AI crawler visits in last 7 days: ${pulse.weekCrawlerVisits}`
      : '';
    const medicalBoundaryBlock = medicalAdjacent
      ? `
Medical-adjacent safety:
- Do not claim treatment, cure, recovery, blood-circulation improvement, pain relief, disease prevention, medical efficacy, prescriptions, contraindications, or replacement of professional medical care.
- Describe the brand only through verified non-medical service facts and clearly avoid health-outcome promises.
- Do not use these Chinese terms, even in negated statements: \u6cbb\u7642, \u7642\u6548, \u6cbb\u7652, \u6839\u6cbb, \u8a3a\u65b7, \u8655\u65b9, \u7528\u85e5, \u526f\u4f5c\u7528, \u7981\u5fcc, \u7de9\u89e3, \u6e1b\u8f15, \u6062\u5fa9, \u5fa9\u539f, \u4fc3\u9032\u8840\u6db2\u5faa\u74b0, \u6539\u5584\u5065\u5eb7, \u8eab\u9ad4\u6a5f\u80fd, \u75c5\u53f2.
- Do not use "\u5065\u5eb7\u6548\u679c" or any outcome-effect comparison language.
- Do not use "\u7642\u6cd5" or "\u7642\u7a0b".
- Do not use the Chinese word "\u91ab\u7642" anywhere in the article.
- Do not use "\u975e\u91ab\u7642" either. It still contains the forbidden word.
- Do not write negated medical disclaimers. Use "\u8cc7\u6599\u908a\u754c\u4e0d\u5305\u542b\u6210\u679c\u627f\u8afe" instead.
- In Traditional Chinese output, do not use: 治療、療效、治癒、根治、診斷、處方、用藥、副作用、禁忌、緩解、減輕、恢復、復原、促進血液循環、改善健康、身體機能、病史.
- Use neutral alternatives: service process, evaluation method, location, booking path, data boundary, and non-medical service positioning.`
      : '';

    return `
You are writing a citation-ready AI Wiki article in Traditional Chinese for Geovault.

Goal:
- Create an article that ChatGPT, Claude, Perplexity, Gemini, and search crawlers can safely cite.
- The article must be factual, neutral, source-grounded, and useful as a brand reference page.
- Push the user's official brand website facts into an AI-readable public article so crawlers can learn the brand, quote it, and connect it back to the official website.
- Do not invent awards, prices, phone numbers, addresses, services, medical effects, guarantees, reviews, customer profiles, or competitor facts.
- If a detail is not present in the verified facts below, phrase it as unknown or omit it.
- Do not include phone numbers or email addresses unless they appear exactly in the verified facts. Prefer the official URL as the contact path.

Article type:
- Day type: ${dayType}
- Angle: ${angleByDay[dayType]}

Brand identity:
- Brand: ${site.name}
- Official URL: ${site.url}
- Geovault directory URL: ${directoryUrl}
- Industry: ${site.industry ?? 'unknown'}
- Fact confidence score: ${graph.confidenceScore}/100

Verified facts:
${this.formatFactList(graph.verifiedFacts)}

Known missing facts:
${this.formatFactList(graph.missingFacts, 'None')}

Target audiences:
${this.formatFactList(graph.targetAudiences, 'No target-audience data provided')}

Not-for / forbidden positioning:
${this.formatFactList(graph.notFor, 'No forbidden positioning provided')}

Verified Q&A:
${qaBlock}

Verified social links:
${socialBlock}
${pulseBlock}
${medicalBoundaryBlock}

Required output:
1. Write 900-1300 Traditional Chinese characters in Markdown.
2. First line must be one descriptive H1 title containing "${site.name}" and at least 10 Chinese/English characters. Do not use only the brand name as the title.
3. The first paragraph must name ${site.name}, include the official URL "${site.url}", and summarize the brand positioning in neutral third-person wording.
4. Use exactly these section headings and no other H2 headings:
   - "## \u54c1\u724c\u5b9a\u4f4d"
   - "## ${site.name} \u9069\u5408\u8ab0"
   - "## \u670d\u52d9\u8207\u8cc7\u6599\u908a\u754c"
   - "## AI \u53ef\u5f15\u7528\u91cd\u9ede"
   - "## \u5e38\u898b\u554f\u984c"
   - "## \u8cc7\u6599\u4f86\u6e90"
5. "\u54c1\u724c\u5b9a\u4f4d" must include at least two verified facts.
6. "\u670d\u52d9\u8207\u8cc7\u6599\u908a\u754c" must clearly distinguish verified service facts from unknown or unavailable facts.
7. "AI \u53ef\u5f15\u7528\u91cd\u9ede" must include exactly 5 concise bullets. Each bullet must be standalone, quote-ready, and based on verified facts only.
8. "\u5e38\u898b\u554f\u984c" must include 3 neutral Q/A pairs and at least one answer must cite the official URL.
9. "\u8cc7\u6599\u4f86\u6e90" must include exactly these two source lines:
   - Official website: ${site.url}
   - Geovault directory: ${directoryUrl}
10. Mention Geovault at most two times outside the source section.
11. Avoid sales CTA, exaggerated marketing language, first-person promotional voice, and generic SEO/GEO advice.
12. End with this exact source note: "*\u8cc7\u6599\u4f86\u6e90\uff1aGeovault AI Wiki \u81ea\u52d5\u5f59\u6574\u516c\u958b\u54c1\u724c\u8cc7\u6599\u8207\u4f7f\u7528\u8005\u63d0\u4f9b\u5167\u5bb9\u3002*"
`;
  }

  async generateClientDailyContent(
    siteId: string,
    dayType?: ClientDailyDay,
    options: { dryRun?: boolean } = {},
  ): Promise<ClientDailyGenerationResult> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, isClient: true, isPublic: true,
        profile: true,
        user: { select: { plan: true, role: true } },
        qas: { orderBy: { sortOrder: 'asc' }, take: 15, select: { question: true, answer: true } },
      },
    });
    if (!site) return { status: 'skipped', reasons: ['not_found'] };
    if (!site.isClient || !site.isPublic) return { status: 'skipped', reasons: ['not_paid_client'] };

    const profile = (site.profile as Record<string, any>) || {};
    if (profile.dailyContentPaused) return { status: 'skipped', reasons: ['paused'] };

    // Resolve dayType for today if not specified
    const today = new Date();
    const resolvedDay = dayType ?? this.dayTypeFor(today);
    if (!resolvedDay) return { status: 'skipped', reasons: ['sunday_off_day'] };

    // Plan gate — STARTER only gets 2 day types, PRO gets all 6
    const planTier = site.user?.plan || 'FREE';
    const allowedDays = this.activeDaysForClient(planTier, site.user?.role);
    if (!allowedDays.includes(resolvedDay)) {
      return { status: 'skipped', reasons: [`day_not_in_plan:${planTier}:${resolvedDay}`] };
    }

    // Idempotency: don't regenerate the same dayType for the same site twice
    // in 24h — if the cron runs twice or admin triggers right after cron.
    const oneDayAgo = new Date(Date.now() - 86400000);
    const recent = await this.prisma.blogArticle.findFirst({
      where: {
        siteId, templateType: 'client_daily',
        createdAt: { gte: oneDayAgo },
        targetKeywords: { has: resolvedDay },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, published: true },
    });
    if (recent && !options.dryRun) {
      return {
        status: 'skipped',
        reasons: [recent.published ? 'already_generated_today' : 'already_has_unpublished_draft_today'],
        slug: recent.slug,
        dayType: resolvedDay,
      };
    }

    const brandFacts = await this.brandFactService.buildForSite(site.id);
    if (!this.brandFactService.isReadyForCitationContent(brandFacts)) {
      return {
        status: 'skipped',
        reasons: [
          'brand_fact_not_ready',
          `confidence:${brandFacts.confidenceScore}`,
          ...brandFacts.missingFacts.slice(0, 6).map((fact) => `missing:${fact}`),
        ],
        dayType: resolvedDay,
      };
    }

    // Build context
    const enriched = (profile._enriched as Record<string, any>) || {};
    const socialLinks = enriched.socialLinks;
    const ctx: BrandShowcaseContext = {
      siteId: site.id,
      qas: site.qas,
      // Prefer enriched description (scraped from official site) over the
      // generic profile.description — the enriched copy carries the brand's
      // own niche language ("脊椎整復品牌" vs the generic profile blurb).
      description: enriched.description || profile.description,
      services: profile.services,
      location: profile.location || enriched.address,
      contact: profile.contact || enriched.telephone,
      forbidden: Array.isArray(profile.forbidden) ? profile.forbidden : [],
      positioning: profile.positioning,
      socialLinks,
    };
    // Stash full enriched object so the prompt builder can pull cleanName for
    // niche reinforcement without inflating BrandShowcaseContext interface.
    (ctx as any)._enriched = enriched;

    // For sat_data_pulse, pull the pulse numbers
    let pulse: { geoScore: number; industryRank: number | null; industryAvgScore: number | null; weekCrawlerVisits: number } | undefined;
    if (resolvedDay === 'sat_data_pulse') {
      const latestScan = await this.prisma.scan.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { totalScore: true },
      });
      const indStats = site.industry
        ? await this.prisma.site.aggregate({
            where: { industry: site.industry, isPublic: true, bestScore: { gt: 0 } },
            _avg: { bestScore: true },
          })
        : null;
      const rank = site.industry
        ? (await this.prisma.site.count({
            where: { industry: site.industry, isPublic: true, bestScore: { gt: latestScan?.totalScore ?? 0 } },
          })) + 1
        : null;
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const weekVisits = await this.prisma.crawlerVisit.count({
        where: { siteId, isSeeded: false, visitedAt: { gte: weekAgo } },
      });
      pulse = {
        geoScore: latestScan?.totalScore ?? 0,
        industryRank: rank,
        industryAvgScore: indStats?._avg.bestScore ? Math.round(indStats._avg.bestScore) : null,
        weekCrawlerVisits: weekVisits,
      };
    }

    const medicalContextText = [
      site.name,
      site.url,
      site.industry,
      ctx.description,
      ctx.services,
      ctx.location,
      ctx.contact,
      ctx.positioning,
      enriched.description,
      enriched.cleanName,
      enriched.address,
    ].filter(Boolean).join('\n');
    const isMedicalAdjacent = this.isMedicalAdjacentBrand(
      site.industry,
      brandFacts,
      medicalContextText,
    );
    const contentStrategy = this.buildClientDailyContentStrategy({
      site: { name: site.name, url: site.url, industry: site.industry },
      graph: brandFacts,
      dayType: resolvedDay,
      pulse,
      medicalAdjacent: isMedicalAdjacent,
    });
    const prompt = `${this.buildClientCitationPrompt({
      dayType: resolvedDay,
      site: { name: site.name, url: site.url, industry: site.industry },
      graph: brandFacts,
      pulse,
    })}

Content operating strategy:
- Strategy angle: ${contentStrategy.angle}
- Primary AI intent: ${contentStrategy.primaryIntent}
- Audience intent: ${contentStrategy.audienceIntent}
- Citation goal: ${contentStrategy.citationGoal}
- Required sections: ${contentStrategy.requiredSections.join(', ')}
- Target keywords: ${contentStrategy.targetKeywords.join(', ') || 'none'}
- Missing customer data signals to state honestly: ${contentStrategy.missingSignals.join(', ') || 'none'}

Extracted customer facts that must drive the article:
${contentStrategy.extractedFacts.map((fact) => `- ${fact}`).join('\n')}`;
    const requiredAnchors = this.buildRequiredAnchors(brandFacts)
      .filter((anchor) => !isMedicalAdjacent || !this.isMedicalAdjacentText(anchor));

    const verifiedFactText = brandFacts.verifiedFacts.join(' \n ');
    const verifiedContacts = [
      ...(verifiedFactText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []),
      ...(verifiedFactText.match(/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/g) || []),
    ];
    const profileRefText = [
      ctx.contact, ctx.location, ctx.description, ctx.services, ctx.positioning,
      site.url, socialLinks?.facebook, socialLinks?.instagram, socialLinks?.youtube, socialLinks?.line,
      enriched.telephone, enriched.email, enriched.address,
      ...brandFacts.verifiedFacts,
      ...brandFacts.targetAudiences,
      ...verifiedContacts,
    ].filter(Boolean).join(' \n ');

    // Mirror the prompt's niche-keyword extraction so the gate enforces what
    // the prompt asked for. Drift between prompt rules and gate rules has
    // historically been the silent cause of "passed-but-bad" content.
    const desc = (enriched.description as string | undefined) || (profile.description as string | undefined) || '';
    const nicheKeywords = extractNicheKeywords(desc, { name: site.name, industry: site.industry });

    // Quality runner replaces the previous 4-attempt loop + inline
    // assessClientDaily. Each day-type has its own ContentSpec (rules +
    // passThreshold) and the runner executes the full→patch retry pipeline
    // while logging every attempt to ArticleQualityLog for the
    // prompt-tuning dashboard.
    const spec = createClientDailySpec(resolvedDay);
    const runStartedAt = new Date();
    const result = await this.qualityRunner.run<ClientDailyData>(
      spec,
      { basePrompt: prompt },
      {
        siteName: site.name,
        industry: site.industry ?? undefined,
        extras: {
          nicheKeywords,
          forbidden: ctx.forbidden ?? [],
          profileRefText,
          siteUrl: site.url,
          verifiedFacts: brandFacts.verifiedFacts,
          missingFacts: brandFacts.missingFacts,
          brandFactConfidence: brandFacts.confidenceScore,
          requiredAnchors,
          medicalAdjacent: isMedicalAdjacent,
        },
      },
      site.id,
    );
    const attemptSummary = result.attempts.map((attempt) => ({
      stage: attempt.stage,
      attempt: attempt.attempt,
      passed: attempt.passed,
      totalScore: attempt.totalScore,
      failedRules: attempt.failedRules,
    }));
    const finalFailedRules = result.attempts[result.attempts.length - 1]?.failedRules ?? [];
    const hardFailedRules = finalFailedRules.filter((rule) =>
      /^(fabricated_contact|fabricated_phone|forbidden_phrase|medical_boundary_violation|client_daily_safety)/.test(rule),
    );
    let fallbackReasons: string[] = [];
    if (hardFailedRules.length > 0) {
      this.logger.warn(
        `client_daily hard quality rejection ${site.name}/${resolvedDay}; switching to fallback: ${hardFailedRules.join(',')}`,
      );
      fallbackReasons = ['fallback_after_hard_quality_rejection', ...hardFailedRules];
    }

    let content = result.content ?? '';
    if (hardFailedRules.length > 0 || result.status !== 'generated' || !content) {
      this.logger.warn(
        `client_daily fallback ${site.name}/${resolvedDay} after ${result.attempts.length} attempts: ${(result.failedRules || []).join(', ')}`,
      );
      fallbackReasons = [...new Set([
        ...fallbackReasons,
        ...(result.failedRules?.length
          ? ['fallback_after_quality_rejection', ...result.failedRules]
          : ['fallback_after_quality_rejection', 'quality_runner_rejected']),
      ])];
      content = this.buildClientDailyFallbackContent({
        site: { id: site.id, name: site.name, url: site.url, industry: site.industry },
        graph: brandFacts,
        dayType: resolvedDay,
        strategy: contentStrategy,
        pulse,
        medicalAdjacent: isMedicalAdjacent,
      });
    }

    const persistRejectedDraft = async (
      reasons: string[],
      draftContent = content,
    ) => {
      if (options.dryRun) return null;
      try {
        return await this.persistClientDailyRejectedDraft({
          site: { id: site.id, name: site.name, url: site.url, industry: site.industry },
          dayType: resolvedDay,
          today,
          content: draftContent,
          graph: brandFacts,
          strategy: contentStrategy,
          pulse,
          medicalAdjacent: isMedicalAdjacent,
          reasons,
          runStartedAt,
        });
      } catch (err) {
        this.logger.error(
          `client_daily rejected draft persist failed ${site.name}/${resolvedDay}: ${err instanceof Error ? err.message : err}`,
          err instanceof Error ? err.stack : undefined,
        );
        return null;
      }
    };

    if (isMedicalAdjacent && this.hasMedicalBoundaryViolation(content)) {
      this.logger.warn(
        `client_daily hard rejected ${site.name}/${resolvedDay}: medical_boundary_violation_post_gate`,
      );
      const draft = await persistRejectedDraft(['medical_boundary_violation']);
      return {
        status: 'rejected',
        reasons: draft?.created
          ? ['draft_saved', 'medical_boundary_violation']
          : ['medical_boundary_violation'],
        slug: draft?.slug,
        dayType: resolvedDay,
        dryRun: options.dryRun || undefined,
        content: options.dryRun ? content : undefined,
        totalScore: result.totalScore,
        attempts: options.dryRun ? attemptSummary : undefined,
      };
    }
    const safetyReasons = this.clientDailySafetyReasons({
      title: content.match(/^#{1,2}\s+(.+)$/m)?.[1] ?? '',
      content,
      targetKeywords: [site.name, site.industry ?? '', resolvedDay, 'daily', 'ai_wiki'].filter(Boolean),
      site: { industry: site.industry },
    });
    if (safetyReasons.length > 0) {
      const hardSafetyReasons = this.getHardClientDailyPublicBlockers(safetyReasons);
      if (hardSafetyReasons.length > 0) {
        this.logger.warn(
          `client_daily safety rejected ${site.name}/${resolvedDay}: ${hardSafetyReasons.join(',')}`,
        );
        const draft = await persistRejectedDraft(hardSafetyReasons);
        return {
          status: 'rejected',
          reasons: draft?.created ? ['draft_saved', ...hardSafetyReasons] : hardSafetyReasons,
          slug: draft?.slug,
          dayType: resolvedDay,
          dryRun: options.dryRun || undefined,
          content: options.dryRun ? content : undefined,
          totalScore: result.totalScore,
          attempts: options.dryRun ? attemptSummary : undefined,
        };
      }
      this.logger.warn(
        `client_daily safety fallback ${site.name}/${resolvedDay}: ${safetyReasons.join(',')}`,
      );
      fallbackReasons = [...new Set([...fallbackReasons, 'fallback_after_safety_repair', ...safetyReasons])];
      content = this.buildClientDailyFallbackContent({
        site: { id: site.id, name: site.name, url: site.url, industry: site.industry },
        graph: brandFacts,
        dayType: resolvedDay,
        strategy: contentStrategy,
        pulse,
        medicalAdjacent: isMedicalAdjacent,
      });
    }
    if (isMedicalAdjacent && this.hasMedicalBoundaryViolation(content)) {
      this.logger.warn(
        `client_daily hard rejected ${site.name}/${resolvedDay}: medical_boundary_violation_after_repair`,
      );
      const draft = await persistRejectedDraft(['medical_boundary_violation']);
      return {
        status: 'rejected',
        reasons: draft?.created
          ? ['draft_saved', 'medical_boundary_violation']
          : ['medical_boundary_violation'],
        slug: draft?.slug,
        dayType: resolvedDay,
        dryRun: options.dryRun || undefined,
        content: options.dryRun ? content : undefined,
        totalScore: result.totalScore,
        attempts: options.dryRun ? attemptSummary : undefined,
      };
    }

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const rawTitle = titleMatch ? titleMatch[1].trim() : '';
    let title = this.makeClientDailyTitle(rawTitle, site.name, resolvedDay);
    if (content.trim()) {
      content = /^#{1,2}\s+.+$/m.test(content)
        ? content.replace(/^#{1,2}\s+.+$/m, `# ${title}`)
        : `# ${title}\n\n${content}`;
    }
    // ASCII-only slug — CJK percent-encoding defeats AI crawlers and SEO.
    // Format: {siteIdShort}-{YYYYMM}-{dayType}-{rand4}
    //   readable enough that admins can spot dates in the URL, still unique
    //   per generation via the trailing rand4.
    const yyyymm = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const rand4 = Date.now().toString(36).slice(-4);
    const slug = `${site.id.slice(0, 10)}-${yyyymm}-${resolvedDay.replace(/_/g, '-')}-${rand4}`;

    let description = this.makeClientDailyDescription(
      content,
      { name: site.name, url: site.url },
      resolvedDay,
    );
    const officialDomain = this.officialDomain(site.url);
    const clientDailyTargetKeywords = [
      site.name,
      site.industry ?? '',
      resolvedDay,
      officialDomain,
      'daily',
      'ai_wiki',
      'brand_facts',
      ...contentStrategy.targetKeywords.slice(0, 8),
    ].filter(Boolean);

    let operatingAudit = this.auditClientDailyOperatingContent({
      title,
      description,
      content,
      site: { name: site.name, url: site.url, industry: site.industry, isPublic: site.isPublic },
      graph: brandFacts,
      strategy: contentStrategy,
      targetKeywords: clientDailyTargetKeywords,
      medicalAdjacent: isMedicalAdjacent,
    });
    if (!operatingAudit.publishable) {
      if (!operatingAudit.repairable) {
        this.logger.warn(
          `client_daily operating gate hard rejected ${site.name}/${resolvedDay}: ${operatingAudit.failedRules.join(',')}`,
        );
        const draft = await persistRejectedDraft(
          operatingAudit.hardFailures.length > 0
            ? operatingAudit.hardFailures
            : operatingAudit.failedRules,
          content,
        );
        const reasons = operatingAudit.hardFailures.length > 0
          ? operatingAudit.hardFailures
          : operatingAudit.failedRules;
        return {
          status: 'rejected',
          reasons: draft?.created ? ['draft_saved', ...reasons] : reasons,
          slug: draft?.slug,
          dayType: resolvedDay,
          dryRun: options.dryRun || undefined,
          content: options.dryRun ? content : undefined,
          totalScore: operatingAudit.score,
          attempts: options.dryRun ? attemptSummary : undefined,
        };
      }
      this.logger.warn(
        `client_daily operating gate repair ${site.name}/${resolvedDay}: score=${operatingAudit.score}; ${operatingAudit.failedRules.join(',')}`,
      );
      fallbackReasons = [...new Set([
        ...fallbackReasons,
        'fallback_after_operating_audit',
        ...operatingAudit.failedRules,
      ])];
      content = this.buildClientDailyFallbackContent({
        site: { id: site.id, name: site.name, url: site.url, industry: site.industry },
        graph: brandFacts,
        dayType: resolvedDay,
        strategy: contentStrategy,
        pulse,
        medicalAdjacent: isMedicalAdjacent,
      });
      title = this.makeClientDailyTitle(
        content.match(/^#{1,2}\s+(.+)$/m)?.[1],
        site.name,
        resolvedDay,
      );
      content = /^#{1,2}\s+.+$/m.test(content)
        ? content.replace(/^#{1,2}\s+.+$/m, `# ${title}`)
        : `# ${title}\n\n${content}`;
      description = this.makeClientDailyDescription(
        content,
        { name: site.name, url: site.url },
        resolvedDay,
      );
      operatingAudit = this.auditClientDailyOperatingContent({
        title,
        description,
        content,
        site: { name: site.name, url: site.url, industry: site.industry, isPublic: site.isPublic },
        graph: brandFacts,
        strategy: contentStrategy,
        targetKeywords: clientDailyTargetKeywords,
        medicalAdjacent: isMedicalAdjacent,
      });
      if (!operatingAudit.publishable) {
        this.logger.warn(
          `client_daily operating gate rejected after repair ${site.name}/${resolvedDay}: score=${operatingAudit.score}; ${operatingAudit.failedRules.join(',')}`,
        );
        const reasons = [
          'content_operating_gate_failed',
          `operating_score:${operatingAudit.score}`,
          ...operatingAudit.failedRules,
        ];
        const draft = await persistRejectedDraft(reasons, content);
        return {
          status: 'rejected',
          reasons: draft?.created ? ['draft_saved', ...reasons] : reasons,
          slug: draft?.slug,
          dayType: resolvedDay,
          dryRun: options.dryRun || undefined,
          content: options.dryRun ? content : undefined,
          totalScore: operatingAudit.score,
          attempts: options.dryRun ? attemptSummary : undefined,
        };
      }
    }

    if (options.dryRun) {
      return {
        status: 'generated',
        dayType: resolvedDay,
        dryRun: true,
        content,
        totalScore: Math.max(result.totalScore ?? 0, operatingAudit.score),
        reasons: fallbackReasons.length > 0 ? fallbackReasons : undefined,
        attempts: attemptSummary,
      };
    }

    let article: { id: string };
    try {
      article = await this.prisma.blogArticle.create({
        data: {
          slug, title,
          description,
          content,
          category: 'client-daily',
          siteId: site.id,
          templateType: 'client_daily',
          industrySlug: site.industry ?? undefined,
          targetKeywords: clientDailyTargetKeywords,
          readingTimeMinutes: this.templateService.estimateReadingTime('client_daily'),
          readTime: `${this.templateService.estimateReadingTime('client_daily')} 分鐘`,
          published: true,
          lastRegeneratedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `client_daily persist failed ${site.name}/${resolvedDay}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      return {
        status: 'rejected',
        reasons: [`persist_failed:${message.slice(0, 160)}`],
        dayType: resolvedDay,
        totalScore: result.totalScore ?? operatingAudit.score,
      };
    }
    // Back-fill articleId on every quality-log row from this run so the
    // dashboard can join attempts to the article that ultimately landed.
    try {
      await this.qualityRunner.attachArticleId(
        `client_daily/${resolvedDay}`,
        site.id,
        article.id,
        runStartedAt,
      );
    } catch (err) {
      this.logger.warn(
        `client_daily quality-log attach failed ${site.name}/${resolvedDay}: ${err instanceof Error ? err.message : err}`,
      );
    }
    this.llmsHostingService.invalidatePlatformLlmsFull(site.id);
    this.pingIndexNow(slug);
    return {
      status: 'generated',
      slug,
      dayType: resolvedDay,
      totalScore: Math.max(result.totalScore ?? 0, operatingAudit.score),
      reasons: fallbackReasons.length > 0 ? fallbackReasons : undefined,
    };
  }

  async getClientDailyReadinessSummary(): Promise<{
    totalClients: number;
    ready: number;
    notReady: number;
    rows: Array<{
      siteId: string;
      name: string;
      industry: string | null;
      url: string;
      ready: boolean;
      confidenceScore: number;
      verifiedFactsCount: number;
      missingFacts: string[];
      suggestedAction: string;
    }>;
  }> {
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isClient: true, isPublic: true }),
      select: { id: true, name: true, industry: true, url: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows = await Promise.all(sites.map(async (site) => {
      const graph = await this.brandFactService.buildForSite(site.id);
      const ready = this.brandFactService.isReadyForCitationContent(graph);
      const suggestedAction = ready
        ? 'ready_to_generate'
        : graph.missingFacts.length > 0
          ? `complete_profile:${graph.missingFacts.slice(0, 4).join(',')}`
          : 'review_brand_facts';

      return {
        siteId: site.id,
        name: site.name,
        industry: site.industry,
        url: site.url,
        ready,
        confidenceScore: graph.confidenceScore,
        verifiedFactsCount: graph.verifiedFacts.length,
        missingFacts: graph.missingFacts,
        suggestedAction,
      };
    }));

    return {
      totalClients: rows.length,
      ready: rows.filter((row) => row.ready).length,
      notReady: rows.filter((row) => !row.ready).length,
      rows: rows.sort((a, b) => Number(a.ready) - Number(b.ready) || a.confidenceScore - b.confidenceScore),
    };
  }

  // Daily client_daily batch is now scheduled via CronManager (DB-driven,
  // taskKey='client_daily_content') so a process restart doesn't drop the
  // day — see TaskRegistryService. The previous @Cron('0 8 * * *') decorator
  // was in-memory only and silently stopped firing whenever Railway
  // redeployed/restarted the API service, which is what caused the
  // 4/27 → 4/30 gap on prod.
  async runClientDailyBatch(): Promise<ClientDailyBatchResult> {
    const today = new Date();
    const dayType = this.dayTypeFor(today);
    if (!dayType) {
      this.logger.log('client_daily batch: Sunday off');
      return { attempted: 0, generated: 0, rejected: 0, skipped: 0, rejectedReasons: {}, perSite: [] };
    }

    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isClient: true, isPublic: true }),
      select: { id: true, name: true },
    });
    this.logger.log(`client_daily batch start: ${sites.length} clients, dayType=${dayType}`);

    const queue = pLimit(2);
    const perSite: ClientDailyBatchSiteResult[] = [];
    const rejectedReasons: Record<string, number> = {};
    let attempted = 0, generated = 0, rejected = 0, skipped = 0;

    await Promise.all(
      sites.map((s) =>
        queue(async () => {
          attempted++;
          try {
            const r = await this.generateClientDailyContent(s.id, dayType);
            perSite.push({
              siteId: s.id,
              name: s.name,
              status: r.status,
              dayType: r.dayType,
              slug: r.slug,
              totalScore: r.totalScore,
              reasons: r.reasons,
            });
            if (r.status === 'generated') generated++;
            else if (r.status === 'rejected') {
              rejected++;
              for (const reason of r.reasons ?? ['rejected']) {
                const bucket = this.bucketClientDailyReason(reason);
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
              }
            } else skipped++;
          } catch (err) {
            rejected++;
            rejectedReasons.exception = (rejectedReasons.exception ?? 0) + 1;
            perSite.push({ siteId: s.id, name: s.name, status: 'error', reasons: [String(err)] });
          }
        }),
      ),
    );

    this.logger.log(
      `client_daily batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped; reasons=${JSON.stringify(rejectedReasons)}`,
    );
    return { attempted, generated, rejected, skipped, rejectedReasons, perSite };
  }

  /**
   * Per-client accumulation stats for dashboard display.
   * "本月累積 N 篇 AI 可引用內容" + recent article list.
   */
  async getClientDailyStats(siteId: string, userId?: string, role?: string) {
    await this.assertSiteAccess(siteId, userId, role);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 86400000);

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        name: true,
        url: true,
        industry: true,
        isPublic: true,
        user: { select: { plan: true, role: true } },
        profile: true,
      },
    });
    const rows = await this.prisma.blogArticle.findMany({
      where: { siteId, templateType: 'client_daily' },
      orderBy: { createdAt: 'desc' },
      select: {
        slug: true,
        title: true,
        description: true,
        content: true,
        published: true,
        createdAt: true,
        targetKeywords: true,
        site: { select: { name: true, url: true, industry: true, isPublic: true } },
      },
    });
    const rowsWithSafety = rows.map((r) => ({
      ...r,
      safetyReasons: this.clientDailyPublicBlockers({
        ...r,
        site: r.site ?? {
          name: site?.name,
          url: site?.url,
          industry: site?.industry,
          isPublic: site?.isPublic,
        },
      }),
    }));
    const publicVisibleRows = rowsWithSafety.filter((r) => r.published && r.safetyReasons.length === 0);

    const totalCount = rowsWithSafety.length;
    const visibleCount = publicVisibleRows.length;
    const unpublishedCount = rowsWithSafety.filter((r) => !r.published).length;
    const hiddenUnsafeCount = rowsWithSafety.filter((r) => r.published && r.safetyReasons.length > 0).length;
    const monthCount = rowsWithSafety.filter((r) => r.createdAt >= monthStart).length;
    const weekCount = rowsWithSafety.filter((r) => r.createdAt >= weekStart).length;
    const recent = rowsWithSafety.slice(0, 10);
    const plan = site?.user?.plan || 'FREE';
    const prof = (site?.profile as Record<string, any>) || {};
    const paused = !!prof.dailyContentPaused;
    const activeDays = this.activeDaysForClient(plan, site?.user?.role);

    return {
      totalCount,
      visibleCount,
      unpublishedCount,
      hiddenUnsafeCount,
      monthCount,
      weekCount,
      plan,
      paused,
      activeDaysPerWeek: activeDays.length,
      activeDayTypes: activeDays,
      recentArticles: recent.map((r) => ({
        slug: r.slug,
        title: r.title,
        createdAt: r.createdAt,
        dayType: r.targetKeywords.find((k) => this.daySequence.includes(k as ClientDailyDay)) || null,
        published: r.published,
        publicVisible: r.published && r.safetyReasons.length === 0,
        safetyReasons: r.safetyReasons,
      })),
    };
  }

  /**
   * Paginated full history of client_daily articles for a site. Used by the
   * dashboard's "Geovault 為您發布的內容" page so paid clients can see every
   * article published on their behalf — not just the last 5 from getStats.
   */
  async listClientDaily(
    siteId: string,
    opts: { page: number; limit: number },
    userId?: string,
    role?: string,
  ): Promise<{
    total: number;
    page: number;
    limit: number;
      items: Array<{
        slug: string;
        title: string;
        dayType: string | null;
        createdAt: Date;
        charLength: number;
        url: string;
        published: boolean;
        publicVisible: boolean;
        safetyReasons: string[];
        repairableReasons: string[];
        hardBlockers: string[];
        canPublish: boolean;
        publicationAction: 'publish' | 'repair_and_publish' | 'manual_required' | null;
      }>;
  }> {
    await this.assertSiteAccess(siteId, userId, role);

    const skip = (opts.page - 1) * opts.limit;
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { name: true, url: true, industry: true, isPublic: true },
    });
    const rows = await this.prisma.blogArticle.findMany({
      where: { siteId, templateType: 'client_daily' },
      orderBy: { createdAt: 'desc' },
      select: {
        slug: true,
        title: true,
        description: true,
        published: true,
        createdAt: true,
        targetKeywords: true,
        content: true,
        site: { select: { name: true, url: true, industry: true, isPublic: true } },
      },
    });
    const rowsWithSafety = rows.map((r) => ({
      ...r,
      safetyReasons: this.clientDailyPublicBlockers({
        ...r,
        site: r.site ?? {
          name: site?.name,
          url: site?.url,
          industry: site?.industry,
          isPublic: site?.isPublic,
        },
      }),
    }));
    const total = rowsWithSafety.length;
    const pageRows = rowsWithSafety.slice(skip, skip + opts.limit);

    const webBase = this.config.get<string>('WEB_URL') || 'https://www.geovault.app';
    return {
      total,
      page: opts.page,
      limit: opts.limit,
      items: pageRows.map((r) => {
        const hardBlockers = this.getHardClientDailyPublicBlockers(r.safetyReasons);
        const repairableReasons = r.safetyReasons.filter((reason) =>
          this.isRepairableClientDailyPublicBlocker(reason),
        );
        const publicVisible = r.published && r.safetyReasons.length === 0;
        const canPublish = !publicVisible && hardBlockers.length === 0;
        return {
          slug: r.slug,
          title: r.title,
          dayType:
            r.targetKeywords.find((k) =>
              this.daySequence.includes(k as ClientDailyDay),
            ) ?? null,
          createdAt: r.createdAt,
          charLength: (r.content || '').replace(/\s+/g, '').length,
          url: `${webBase}/blog/${r.slug}`,
          published: r.published,
          publicVisible,
          safetyReasons: r.safetyReasons,
          repairableReasons,
          hardBlockers,
          canPublish,
          publicationAction: publicVisible
            ? null
            : hardBlockers.length > 0
              ? 'manual_required'
              : repairableReasons.length > 0
                ? 'repair_and_publish'
                : 'publish',
        };
      }),
    };
  }

  async setClientDailyArticlePublished(
    slug: string,
    published: boolean,
    userId?: string,
    role?: string,
  ) {
    const article = await this.prisma.blogArticle.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        content: true,
        targetKeywords: true,
        templateType: true,
        published: true,
        siteId: true,
        site: {
          select: {
            id: true,
            name: true,
            url: true,
            industry: true,
            isPublic: true,
          },
        },
      },
    });

    if (!article || article.templateType !== 'client_daily' || !article.siteId) {
      throw new NotFoundException('Client daily article not found');
    }

    const articleSiteId = article.siteId;
    await this.assertSiteAccess(articleSiteId, userId, role);

    let repaired = false;
    let blockers = this.clientDailyPublicBlockers(article);
    if (published) {
      const repairedResult = await this.repairClientDailyArticleForPublication({
        ...article,
        siteId: articleSiteId,
      });
      repaired = repairedResult.repaired;
      blockers = repairedResult.blockers;
      if (repairedResult.hardBlockers.length > 0) {
        throw new BadRequestException({
          message: 'Article cannot be published until hard quality blockers are fixed',
          blockers: repairedResult.hardBlockers,
          repairableBlockers: blockers.filter((reason) =>
            this.isRepairableClientDailyPublicBlocker(reason),
          ),
        });
      }
    }

    const updated = await this.prisma.blogArticle.update({
      where: { id: article.id },
      data: { published },
      select: { slug: true, title: true, published: true },
    });

    this.llmsHostingService.invalidatePlatformLlmsFull(articleSiteId);
    if (published) this.pingIndexNow(article.slug);

    return {
      ...updated,
      publicVisible: updated.published && blockers.length === 0,
      safetyReasons: blockers,
      repaired,
    };
  }

  async qualityAudit(minScore: number = 85) {
    const skippedClientDaily = await this.prisma.blogArticle.count({
      where: { published: true, templateType: 'client_daily' },
    });
    const articles = await this.prisma.blogArticle.findMany({
      where: { published: true, NOT: { templateType: 'client_daily' } },
      select: { id: true, title: true, content: true, siteId: true, slug: true },
    });

    let unpublished = 0;
    let kept = 0;
    const unpublishedTitles: string[] = [];

    for (const article of articles) {
      const siteName = article.title?.split(' ')[0] || '';
      const quality = this.assessArticleQuality(article.content || '', siteName);
      if (quality < minScore) {
        await this.prisma.blogArticle.update({
          where: { id: article.id },
          data: { published: false },
        });
        unpublished++;
        unpublishedTitles.push(`${quality}/100 | ${article.slug}`);
      } else {
        kept++;
      }
    }

    if (unpublished > 0) {
      this.llmsHostingService.invalidatePlatformLlmsFull();
    }

    this.logger.log(
      `Quality audit complete: ${kept} kept, ${unpublished} unpublished, 0 deleted (threshold: ${minScore})`,
    );
    return {
      total: articles.length,
      kept,
      unpublished,
      deleted: 0,
      skippedClientDaily,
      threshold: minScore,
      unpublishedTitles,
    };
  }
}
