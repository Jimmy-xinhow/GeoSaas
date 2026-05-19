import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { canAccessSite } from '../../common/auth/site-access';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { TogglePublicDto } from './dto/toggle-public.dto';
import { IndexNowService } from '../indexnow/indexnow.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';
import { ProfileEnrichmentService } from '../sites/profile-enrichment.service';
import { BlogArticleService } from '../blog-article/blog-article.service';
import {
  getDirectorySiteSeoIssues,
  isIndexableDirectorySite,
  publicBlogArticleWhere,
  publicIndexableBlogArticleWhere,
  publicSiteWhere,
  publicSuccessCaseWhere,
  isIndexablePublicBlogArticle,
  isIndexablePublicSuccessCase,
  unsafePublicBlogArticleWhere,
  unsafePublicSiteWhere,
  unsafePublicSuccessCaseWhere,
  normalizePublicSiteName,
} from '../../common/utils/public-data-filter';

// Simple in-memory cache with TTL
class MemCache {
  private store = new Map<string, { data: any; expiresAt: number }>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set(key: string, data: any, ttlMs: number) {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  clear() {
    this.store.clear();
  }
}

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);
  private readonly cache = new MemCache();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly indexNowService?: IndexNowService,
    @Optional() private readonly llmsHostingService?: LlmsHostingService,
    @Optional() private readonly profileEnrichment?: ProfileEnrichmentService,
    @Optional() private readonly blogArticleService?: BlogArticleService,
  ) {}

  private isAdmin(role?: string): boolean {
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'admin' || role === 'super_admin';
  }

  private invalidatePublicDirectoryCaches(siteId?: string): void {
    this.cache.clear();
    this.llmsHostingService?.invalidatePlatformLlmsFull(siteId);
  }

  private getProfileDescription(profile: unknown): string {
    if (!profile || typeof profile !== 'object') return '';
    const data = profile as Record<string, unknown>;
    const value =
      data.description ??
      data.summary ??
      data.brandDescription ??
      data.about ??
      '';
    return typeof value === 'string' ? value.trim() : String(value || '').trim();
  }

  private countCoreGeoFailures(scan?: {
    results?: Array<{ indicator?: string | null; status?: string | null }>;
  } | null): number {
    return (scan?.results || []).filter((result) => {
      const indicator = String(result.indicator || '').toLowerCase();
      return (
        result.status === 'fail' &&
        (indicator.includes('json') ||
          indicator.includes('llms') ||
          indicator.includes('schema') ||
          indicator.includes('meta'))
      );
    }).length;
  }

  private withPublicDisplayName<T extends { name: string | null }>(site: T): T {
    return { ...site, name: normalizePublicSiteName(site.name) };
  }

  private async addBaselineSeoQa(site: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    bestScore: number;
    profile: unknown;
  }): Promise<number> {
    const existing = await this.prisma.siteQa.count({ where: { siteId: site.id } });
    if (existing > 0) return 0;

    const description = this.getProfileDescription(site.profile);
    if (description.length < 40) return 0;

    const industryText = site.industry ? `，產業分類為 ${site.industry}` : '';
    const items = [
      {
        question: `${site.name} 是什麼品牌？`,
        answer: `${site.name} 的官方網站是 ${site.url}${industryText}。根據 Geovault 收錄資料，這個品牌目前的 GEO 分數為 ${site.bestScore}/100。${description}`,
        category: 'brand',
      },
      {
        question: `${site.name} 的 GEO 分數代表什麼？`,
        answer: `${site.name} 的 GEO 分數用來評估網站對 AI 搜尋與大型語言模型引用的友善程度，會參考結構化資料、llms.txt、Meta Description、FAQ Schema、Open Graph 標籤與內容可讀性等訊號。`,
        category: 'geo',
      },
      {
        question: `AI 在什麼情境下可能引用 ${site.name}？`,
        answer: `當使用者詢問與 ${site.name}${site.industry ? `、${site.industry}` : ''} 或其官方網站資訊相關的問題時，AI 可以根據品牌描述、網站 URL、GEO 分數與公開知識庫資料理解這個品牌。`,
        category: 'ai-citation',
      },
    ];

    await this.prisma.siteQa.createMany({
      data: items.map((item, index) => ({
        siteId: site.id,
        question: item.question,
        answer: item.answer,
        category: item.category,
        sortOrder: index,
      })),
    });
    return items.length;
  }

  private withDerivedScoreBadges<T extends { badge: string; label: string; awardedAt: Date }>(
    badges: T[],
    bestScore: number,
    awardedAt: Date,
  ): T[] {
    const scoreBadges = [
      { min: 50, badge: 'score_50', label: 'GEO 50+' },
      { min: 60, badge: 'score_60', label: 'GEO 60+' },
      { min: 70, badge: 'score_70', label: 'GEO 70+' },
      { min: 80, badge: 'score_80', label: 'GEO 80+' },
      { min: 90, badge: 'score_90', label: 'GEO 90+' },
      { min: 100, badge: 'score_100', label: '滿分達成' },
    ];
    const byBadge = new Map<string, T>(badges.map((badge) => [badge.badge, badge]));

    for (const scoreBadge of scoreBadges) {
      if (bestScore >= scoreBadge.min && !byBadge.has(scoreBadge.badge)) {
        byBadge.set(scoreBadge.badge, { ...scoreBadge, awardedAt } as unknown as T);
      }
    }

    return Array.from(byBadge.values()).sort(
      (a, b) => new Date(a.awardedAt).getTime() - new Date(b.awardedAt).getTime(),
    );
  }

  /**
   * One-shot aggregate query for /sitemap.xml. Replaces ~14 sequential HTTP
   * calls from the web container — those were timing out at the 3s deadline
   * (web→api goes via Cloudflare, not Railway internal networking, so 14
   * parallel requests get queued/throttled at the edge). This single endpoint
   * runs all four queries in parallel inside the API container, where the
   * DB connection is local and reliable.
   *
   * Returns:
   *   sites[]          — public site ids for /directory/{id}, /feed, /feed.json
   *   blogArticles[]   — DB-backed published articles for /blog/{slug}
   *   cases[]          — approved success cases for /cases/{id}
   *   industrySites{}  — { [industry]: [siteId, ...] } for /industry/{ind}/{id}
   */
  async getSitemapData() {
    const [sites, blogArticles, cases] = await Promise.all([
      this.prisma.site.findMany({
        where: publicSiteWhere({ isPublic: true, bestScore: { gte: 60 }, industry: { not: null } }),
        select: {
          id: true,
          name: true,
          url: true,
          profile: true,
          bestScore: true,
          bestScoreAt: true,
          industry: true,
          _count: { select: { qas: true, blogArticles: true } },
          scans: {
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: {
              completedAt: true,
              results: { select: { indicator: true, status: true } },
            },
          },
        },
        orderBy: { bestScore: 'desc' },
        take: 2000,
      }),
      this.prisma.blogArticle.findMany({
        where: publicIndexableBlogArticleWhere({ published: true }),
        select: {
          slug: true,
          title: true,
          description: true,
          createdAt: true,
          site: { select: { name: true, url: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      this.prisma.geoSuccessCase.findMany({
        where: publicSuccessCaseWhere({ status: 'approved' }),
        select: {
          id: true,
          title: true,
          queryUsed: true,
          aiResponse: true,
          createdAt: true,
          site: { select: { name: true, url: true, isPublic: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const industrySites: Record<string, string[]> = {};
    const indexableSites = sites.filter((s) =>
      isIndexableDirectorySite({
        ...s,
        latestScanCompletedAt: s.scans[0]?.completedAt,
        qasCount: s._count.qas,
        blogArticlesCount: s._count.blogArticles,
        coreGeoFailuresCount: this.countCoreGeoFailures(s.scans[0]),
      }),
    );
    for (const s of indexableSites) {
      if (!s.industry) continue;
      (industrySites[s.industry] ||= []).push(s.id);
    }

    return {
      sites: indexableSites.map((s) => ({ id: s.id, bestScoreAt: s.bestScoreAt })),
      blogArticles: blogArticles
        .filter((article) => isIndexablePublicBlogArticle(article))
        .map(({ slug, createdAt }) => ({ slug, createdAt })),
      cases: cases
        .filter((item) => isIndexablePublicSuccessCase(item))
        .map(({ id, createdAt }) => ({ id, createdAt })),
      industrySites,
    };
  }

  async auditPublicDataHygiene(apply = false) {
    const [unsafeSites, unsafeArticles, unsafeCases] = await Promise.all([
      this.prisma.site.findMany({
        where: unsafePublicSiteWhere({ isPublic: true }),
        select: { id: true, name: true, url: true, isPublic: true },
        take: 100,
      }),
      this.prisma.blogArticle.findMany({
        where: unsafePublicBlogArticleWhere({ published: true }),
        select: {
          id: true,
          slug: true,
          title: true,
          published: true,
          site: { select: { name: true, url: true } },
        },
        take: 100,
      }),
      this.prisma.geoSuccessCase.findMany({
        where: unsafePublicSuccessCaseWhere({ status: 'approved' }),
        select: {
          id: true,
          title: true,
          aiPlatform: true,
          status: true,
          site: { select: { name: true, url: true } },
        },
        take: 100,
      }),
    ]);

    const result: Record<string, any> = {
      dryRun: !apply,
      unsafeSites: { count: unsafeSites.length, samples: unsafeSites },
      unsafeArticles: { count: unsafeArticles.length, samples: unsafeArticles },
      unsafeCases: { count: unsafeCases.length, samples: unsafeCases },
    };

    if (!apply) return result;

    const [sitesUpdated, articlesUpdated, casesUpdated] = await Promise.all([
      this.prisma.site.updateMany({
        where: unsafePublicSiteWhere({ isPublic: true }),
        data: { isPublic: false },
      }),
      this.prisma.blogArticle.updateMany({
        where: unsafePublicBlogArticleWhere({ published: true }),
        data: { published: false },
      }),
      this.prisma.geoSuccessCase.updateMany({
        where: unsafePublicSuccessCaseWhere({ status: 'approved' }),
        data: {
          status: 'rejected',
          featuredAt: null,
          rejectionReason: 'Removed from public SEO surfaces by hygiene cleanup',
        },
      }),
    ]);

    const webUrl = process.env.FRONTEND_URL || 'https://www.geovault.app';
    for (const path of ['/sitemap.xml', '/blog', '/directory', '/cases', '/llms.txt', '/llms-full.txt']) {
      this.indexNowService?.submitUrl(`${webUrl}${path}`).catch(() => {});
    }
    this.invalidatePublicDirectoryCaches();

    return {
      ...result,
      applied: {
        sitesSetPrivate: sitesUpdated.count,
        articlesUnpublished: articlesUpdated.count,
        casesRejected: casesUpdated.count,
      },
    };
  }

  async recoverDirectorySeo(opts: {
    apply?: boolean;
    limit?: number;
    includeArticles?: boolean;
  } = {}) {
    const apply = opts.apply === true;
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const includeArticles = opts.includeArticles === true;

    const candidates = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        bestScore: { gte: 60 },
        industry: { not: null },
      }),
      select: {
        id: true,
        name: true,
        url: true,
        profile: true,
        industry: true,
        bestScore: true,
        bestScoreAt: true,
        updatedAt: true,
        _count: {
          select: {
            qas: true,
            blogArticles: true,
            crawlerVisits: true,
          },
        },
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
      orderBy: [{ bestScore: 'desc' }, { updatedAt: 'asc' }],
      take: 500,
    });

    const withIssues = candidates
      .map((site) => ({
        site,
        issues: getDirectorySiteSeoIssues({
          ...site,
          latestScanCompletedAt: site.scans[0]?.completedAt,
          qasCount: site._count.qas,
          blogArticlesCount: site._count.blogArticles,
        }),
        descriptionLength: this.getProfileDescription(site.profile).length,
      }))
      .filter((item) => item.issues.length > 0);

    const recoverable = withIssues
      .filter(
        (item) =>
          !item.issues.some((issue) =>
            [
              'low-score',
              'missing-industry',
              'missing-score-date',
              'missing-completed-scan',
              'unsafe-test-site',
            ].includes(issue),
          ),
      )
      .sort((a, b) => {
        const aOnlySupport = a.issues.length === 1 && a.issues[0] === 'missing-supporting-content';
        const bOnlySupport = b.issues.length === 1 && b.issues[0] === 'missing-supporting-content';
        if (aOnlySupport !== bOnlySupport) return aOnlySupport ? -1 : 1;
        return b.site.bestScore - a.site.bestScore;
      })
      .slice(0, limit);

    const result = {
      apply,
      includeArticles,
      scanned: candidates.length,
      alreadyIndexable: candidates.length - withIssues.length,
      blocked: withIssues.length,
      attempted: recoverable.length,
      enriched: 0,
      qaCreated: 0,
      articlesGenerated: 0,
      stillBlocked: 0,
      samples: [] as Array<{
        id: string;
        name: string;
        beforeIssues: string[];
        afterIssues?: string[];
        descriptionLengthBefore: number;
        descriptionLengthAfter?: number;
        qasBefore: number;
        qasAfter?: number;
        articleStatus?: string;
      }>,
    };

    for (const item of recoverable) {
      const sample = {
        id: item.site.id,
        name: item.site.name,
        beforeIssues: item.issues,
        descriptionLengthBefore: item.descriptionLength,
        qasBefore: item.site._count.qas,
      } as (typeof result.samples)[number];

      if (!apply) {
        result.samples.push(sample);
        continue;
      }

      if (item.issues.includes('thin-description') && this.profileEnrichment) {
        const enriched = await this.profileEnrichment.enrichSite(item.site.id);
        if (enriched?.description) result.enriched++;
      }

      const refreshed = await this.prisma.site.findUnique({
        where: { id: item.site.id },
        select: {
          id: true,
          name: true,
          url: true,
          profile: true,
          industry: true,
          bestScore: true,
          bestScoreAt: true,
          _count: { select: { qas: true, blogArticles: true } },
          scans: {
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { completedAt: true },
          },
        },
      });
      if (!refreshed) continue;

      const qaCreated = await this.addBaselineSeoQa(refreshed);
      result.qaCreated += qaCreated;

      let after = await this.prisma.site.findUnique({
        where: { id: item.site.id },
        select: {
          id: true,
          name: true,
          url: true,
          profile: true,
          industry: true,
          bestScore: true,
          bestScoreAt: true,
          _count: { select: { qas: true, blogArticles: true } },
          scans: {
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { completedAt: true },
          },
        },
      });
      if (!after) continue;

      let afterIssues = getDirectorySiteSeoIssues({
        ...after,
        latestScanCompletedAt: after.scans[0]?.completedAt,
        qasCount: after._count.qas,
        blogArticlesCount: after._count.blogArticles,
      });

      if (includeArticles && afterIssues.length === 0 && this.blogArticleService) {
        const article = await this.blogArticleService.generateBrandShowcaseForSite(after.id);
        sample.articleStatus = article.status;
        if (article.status === 'generated') result.articlesGenerated++;
      }

      after = await this.prisma.site.findUnique({
        where: { id: item.site.id },
        select: {
          profile: true,
          _count: { select: { qas: true, blogArticles: true } },
        },
      }) as any;

      sample.descriptionLengthAfter = after ? this.getProfileDescription(after.profile).length : undefined;
      sample.qasAfter = after?._count.qas;
      sample.afterIssues = afterIssues;
      if (afterIssues.length > 0) result.stillBlocked++;
      this.invalidatePublicDirectoryCaches(item.site.id);
      result.samples.push(sample);
    }

    return result;
  }

  async listDirectory(query: QueryDirectoryDto) {
    const { search, industry, tier, minScore, page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;

    const where: any = publicSiteWhere({ isPublic: true });
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (industry) where.industry = industry;
    if (tier) where.tier = tier;
    if (minScore !== undefined) where.bestScore = { gte: minScore };

    const [items, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        select: {
          id: true,
          name: true,
          url: true,
          industry: true,
          tier: true,
          bestScore: true,
          bestScoreAt: true,
          createdAt: true,
        },
        orderBy: { bestScore: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.site.count({ where }),
    ]);

    return {
      items: items.map((site) => this.withPublicDisplayName(site)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLeaderboard() {
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true, bestScore: { gt: 0 } }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
      },
      orderBy: { bestScore: 'desc' },
      take: 10,
    });
    return sites.map((site) => this.withPublicDisplayName(site));
  }

  async getStats() {
    const cached = this.cache.get('directory-stats');
    if (cached) return cached;

    const [totalSites, avgResult, tierCounts] = await Promise.all([
      this.prisma.site.count({ where: publicSiteWhere({ isPublic: true }) }),
      this.prisma.site.aggregate({
        where: publicSiteWhere({ isPublic: true }),
        _avg: { bestScore: true },
      }),
      this.prisma.site.groupBy({
        by: ['tier'],
        where: publicSiteWhere({ isPublic: true, tier: { not: null } }),
        _count: true,
      }),
    ]);

    const tierDistribution: Record<string, number> = {};
    for (const t of tierCounts) {
      if (t.tier) tierDistribution[t.tier] = t._count;
    }

    const statsResult = {
      totalSites,
      avgScore: Math.round(avgResult._avg.bestScore || 0),
      tierDistribution,
    };
    this.cache.set('directory-stats', statsResult, 120000); // 2 min cache
    return statsResult;
  }

  async getNewcomers() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        createdAt: { gte: thirtyDaysAgo },
      }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return sites.map((site) => this.withPublicDisplayName(site));
  }

  /** Top 10 sites by crawler visits in the last 24h */
  async getTodayHottest() {
    const oneDayAgo = new Date(Date.now() - 86400000);

    const topSites = await this.prisma.crawlerVisit.groupBy({
      by: ['siteId'],
      where: {
        site: publicSiteWhere({ isPublic: true }),
        isSeeded: false,
        visitedAt: { gte: oneDayAgo },
      },
      _count: true,
      orderBy: { _count: { siteId: 'desc' } },
      take: 10,
    });

    if (topSites.length === 0) return [];

    const siteIds = topSites.map((s: any) => s.siteId);
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ id: { in: siteIds } }),
      select: { id: true, name: true, url: true, industry: true, tier: true, bestScore: true },
    });

    const siteMap = new Map(sites.map((s: any) => [s.id, this.withPublicDisplayName(s)]));
    return topSites.map((t: any) => ({
      ...(siteMap.get(t.siteId) || {}),
      todayVisits: t._count,
    }));
  }

  /** Top 10 sites by total crawler visits (all time) */
  async getMostCrawled() {
    const topSites = await this.prisma.crawlerVisit.groupBy({
      by: ['siteId'],
      where: {
        site: publicSiteWhere({ isPublic: true }),
        isSeeded: false,
      },
      _count: true,
      orderBy: { _count: { siteId: 'desc' } },
      take: 10,
    });

    if (topSites.length === 0) return [];

    const siteIds = topSites.map((s: any) => s.siteId);
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ id: { in: siteIds } }),
      select: { id: true, name: true, url: true, industry: true, tier: true, bestScore: true },
    });

    const siteMap = new Map(sites.map((s: any) => [s.id, this.withPublicDisplayName(s)]));
    return topSites.map((t: any) => ({
      ...(siteMap.get(t.siteId) || {}),
      totalVisits: t._count,
    }));
  }

  /** Sites with recent scan activity (last 7 days) */
  async getRecentlyActive() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentScans = await this.prisma.scan.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: sevenDaysAgo },
        site: publicSiteWhere({ isPublic: true }),
      },
      orderBy: { completedAt: 'desc' },
      distinct: ['siteId'],
      take: 10,
      select: {
        siteId: true,
        totalScore: true,
        completedAt: true,
        site: {
          select: { id: true, name: true, url: true, industry: true, tier: true, bestScore: true },
        },
      },
    });

    return recentScans.map((s: any) => ({
      ...this.withPublicDisplayName(s.site),
      lastScanScore: s.totalScore,
      lastScanAt: s.completedAt,
    }));
  }

  /** Platform-wide stats for landing page */
  /** Full wiki data for a specific industry */
  async getIndustryWikiData(industrySlug: string) {
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ industry: industrySlug, isPublic: true }),
      select: {
        id: true,
        name: true,
        url: true,
        bestScore: true,
        tier: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            completedAt: true,
            results: { select: { indicator: true, score: true, status: true } },
          },
        },
      },
      orderBy: { bestScore: 'desc' },
    });

    if (sites.length === 0) return null;

    const scores = sites.map((s: any) => s.bestScore);
    const avgScore = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);

    // Indicator pass rates
    const indicatorNames: Record<string, string> = {
      json_ld: 'JSON-LD',
      llms_txt: 'llms.txt',
      og_tags: 'OG Tags',
      meta_description: 'Meta Description',
      faq_schema: 'FAQ Schema',
      title_optimization: '標題優化',
      contact_info: '聯絡資訊',
      image_alt: '圖片 Alt',
    };

    const indicatorStats: Record<string, { name: string; passRate: number }> = {};
    const allScans = sites.map((s: any) => s.scans[0]).filter(Boolean);

    for (const [key, label] of Object.entries(indicatorNames)) {
      if (allScans.length === 0) {
        indicatorStats[key] = { name: label, passRate: 0 };
      } else {
        const passCount = allScans.filter((scan: any) =>
          scan.results.some((r: any) => r.indicator === key && r.status === 'pass'),
        ).length;
        indicatorStats[key] = { name: label, passRate: Math.round((passCount / allScans.length) * 100) };
      }
    }

    const weakestIndicators = Object.entries(indicatorStats)
      .sort((a, b) => a[1].passRate - b[1].passRate)
      .slice(0, 3)
      .map(([key, val]) => ({ key, name: val.name, passRate: val.passRate }));

    const levelDistribution = {
      platinum: sites.filter((s: any) => s.tier === 'platinum').length,
      gold: sites.filter((s: any) => s.tier === 'gold').length,
      silver: sites.filter((s: any) => s.tier === 'silver').length,
      bronze: sites.filter((s: any) => s.tier === 'bronze').length,
      unrated: sites.filter((s: any) => !s.tier).length,
    };

    return {
      industrySlug,
      totalSites: sites.length,
      avgScore,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      levelDistribution,
      indicatorStats,
      weakestIndicators,
      topSites: sites.slice(0, 10).map((s: any) => ({
        id: s.id,
        name: normalizePublicSiteName(s.name),
        url: s.url,
        bestScore: s.bestScore,
        tier: s.tier,
      })),
    };
  }

  /** Stats for a specific industry */
  async getIndustryStats(industry: string) {
    const [totalSites, avgResult, topSites] = await Promise.all([
      this.prisma.site.count({ where: publicSiteWhere({ isPublic: true, industry }) }),
      this.prisma.site.aggregate({
        where: publicSiteWhere({ isPublic: true, industry }),
        _avg: { bestScore: true },
        _max: { bestScore: true },
      }),
      this.prisma.site.findMany({
        where: publicSiteWhere({ isPublic: true, industry, bestScore: { gt: 0 } }),
        select: { id: true, name: true, url: true, tier: true, bestScore: true },
        orderBy: { bestScore: 'desc' },
        take: 5,
      }),
    ]);

    return {
      industry,
      totalSites,
      avgScore: Math.round(avgResult._avg.bestScore || 0),
      maxScore: avgResult._max.bestScore || 0,
      topSites: topSites.map((site) => this.withPublicDisplayName(site)),
    };
  }

  /** Stats per industry (for overview) */
  async getAllIndustryStats() {
    const stats = await this.prisma.site.groupBy({
      by: ['industry'],
      where: publicSiteWhere({ isPublic: true, industry: { not: null } }),
      _count: true,
      _avg: { bestScore: true },
    });

    return stats
      .filter((s: any) => s.industry)
      .map((s: any) => ({
        industry: s.industry!,
        count: s._count,
        avgScore: Math.round(s._avg.bestScore || 0),
      }))
      .sort((a: any, b: any) => b.count - a.count);
  }

  async getPlatformStats() {
    const cached = this.cache.get('platform-stats');
    if (cached) return cached;

    const oneDayAgo = new Date(Date.now() - 86400000);

    const [
      totalPublicSites,
      totalScans,
      totalCrawlerVisits,
      crawlerVisits24h,
      activeBotCount,
    ] = await Promise.all([
      this.prisma.site.count({ where: publicSiteWhere({ isPublic: true }) }),
      this.prisma.scan.count({ where: { status: 'COMPLETED' } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false, visitedAt: { gte: oneDayAgo } } }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: { isSeeded: false, visitedAt: { gte: oneDayAgo } },
      }).then((r: any) => r.length),
    ]);

    const result = {
      totalSites: totalPublicSites,
      totalScans,
      totalCrawlerVisits,
      crawlerVisits24h,
      activeBots: activeBotCount,
    };
    this.cache.set('platform-stats', result, 60000); // 1 minute cache
    return result;
  }

  async getCrawlerFeed(limit = 20) {
    const cacheKey = `crawler-feed-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const recentVisits = await this.prisma.crawlerVisit.findMany({
      where: {
        site: publicSiteWhere({ isPublic: true }),
        isSeeded: false,
      },
      select: {
        id: true,
        botName: true,
        botOrg: true,
        url: true,
        statusCode: true,
        visitedAt: true,
        site: {
          select: {
            name: true,
            url: true,
            industry: true,
          },
        },
      },
      orderBy: { visitedAt: 'desc' },
      take: limit,
    });

    // Aggregate: total visits last 24h, active bots count
    const oneDayAgo = new Date(Date.now() - 86400000);
    const [last24hCount, activeBots] = await Promise.all([
      this.prisma.crawlerVisit.count({
        where: {
          site: publicSiteWhere({ isPublic: true }),
          isSeeded: false,
          visitedAt: { gte: oneDayAgo },
        },
      }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: {
          site: publicSiteWhere({ isPublic: true }),
          isSeeded: false,
          visitedAt: { gte: oneDayAgo },
        },
        _count: true,
      }),
    ]);

    const feedResult = {
      feed: recentVisits.map((visit) => ({
        ...visit,
        site: this.withPublicDisplayName(visit.site),
      })),
      stats: {
        metricScope: 'real',
        last24h: last24hCount,
        activeBots: activeBots.map((b: any) => ({
          name: b.botName,
          count: b._count,
        })),
      },
    };
    this.cache.set(cacheKey, feedResult, 30000); // 30 second cache
    return feedResult;
  }

  async getSiteDetail(siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: publicSiteWhere({ id: siteId, isPublic: true }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
        bestScoreAt: true,
        profile: true,
        createdAt: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            totalScore: true,
            completedAt: true,
            results: {
              select: {
                indicator: true,
                score: true,
                status: true,
                suggestion: true,
              },
            },
          },
        },
        qas: {
          take: 5,
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            question: true,
            answer: true,
            category: true,
          },
        },
        badges: {
          orderBy: { awardedAt: 'asc' },
          select: { badge: true, label: true, awardedAt: true },
        },
        _count: {
          select: {
            qas: true,
            blogArticles: true,
          },
        },
      },
    });

    if (!site) throw new NotFoundException('Site not found');

    const [scoreTrend, crawlerStats, totalCrawlerVisits] = await Promise.all([
      this.prisma.scan.findMany({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'asc' },
        take: 10,
        select: { totalScore: true, completedAt: true },
      }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName', 'botOrg'],
        where: { siteId, isSeeded: false },
        _count: true,
        _max: { visitedAt: true },
      }),
      this.prisma.crawlerVisit.count({ where: { siteId, isSeeded: false } }),
    ]);

    const { scans, badges, _count, ...rawSiteData } = site;
    const siteData = this.withPublicDisplayName(rawSiteData);
    const displayBadges = this.withDerivedScoreBadges(
      badges,
      site.bestScore,
      site.bestScoreAt ?? site.createdAt,
    );
    const seoIssues = getDirectorySiteSeoIssues({
      ...site,
      latestScanCompletedAt: scans[0]?.completedAt,
      qasCount: _count.qas,
      blogArticlesCount: _count.blogArticles,
    });

    return {
      ...siteData,
      badges: displayBadges,
      seoIndexable: seoIssues.length === 0,
      seoIssues,
      latestScan: scans[0] || null,
      scoreTrend: scoreTrend.map((s: any) => ({
        date: s.completedAt,
        score: s.totalScore,
      })),
      crawlerActivity: {
        totalVisits: totalCrawlerVisits,
        bots: crawlerStats.map((b: any) => ({
          name: b.botName,
          org: b.botOrg,
          visitCount: b._count,
          lastVisit: b._max.visitedAt,
        })),
      },
    };
  }

  /** Sites with the biggest score improvement (first scan → best scan) */
  async getProgressStars() {
    // Get public sites that have at least 2 scans
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        bestScore: { gt: 0 },
        scans: { some: { status: 'COMPLETED' } },
      }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'asc' },
          select: { totalScore: true, completedAt: true },
        },
      },
    });

    const stars = sites
      .filter((s: any) => s.scans.length >= 2)
      .map((s: any) => {
        const firstScan = s.scans[0];
        const bestScan = s.scans.reduce((a: any, b: any) => (b.totalScore > a.totalScore ? b : a), s.scans[0]);
        const improvement = bestScan.totalScore - firstScan.totalScore;
        const daysBetween = Math.ceil(
          (new Date(bestScan.completedAt!).getTime() - new Date(firstScan.completedAt!).getTime()) / 86400000,
        );

        return {
          id: s.id,
          name: normalizePublicSiteName(s.name),
          url: s.url,
          industry: s.industry,
          tier: s.tier,
          firstScore: firstScan.totalScore,
          bestScore: bestScan.totalScore,
          improvement,
          scanCount: s.scans.length,
          daysToImprove: Math.max(daysBetween, 1),
        };
      })
      .filter((s: any) => s.improvement > 0)
      .sort((a: any, b: any) => b.improvement - a.improvement)
      .slice(0, 10);

    return stars;
  }

  async togglePublic(siteId: string, dto: TogglePublicDto, userId: string, role?: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');
    if (!canAccessSite(site, userId, role)) {
      throw new ForbiddenException('You do not have access to this site');
    }

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        isPublic: dto.isPublic,
        ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
      },
      select: {
        id: true,
        url: true,
        isPublic: true,
        industry: true,
        tier: true,
        bestScore: true,
      },
    });

    // Auto-submit to IndexNow when site goes public
    if (dto.isPublic && this.indexNowService) {
      this.indexNowService.submitUrl(site.url).catch((err) => {
        this.logger.warn(`IndexNow auto-submit failed for ${site.url}: ${err}`);
      });
    }
    this.invalidatePublicDirectoryCaches(siteId);

    return updated;
  }

  async setVerified(siteId: string, isVerified: boolean) {
    return this.prisma.site.update({
      where: { id: siteId },
      data: { isVerified, verifiedAt: isVerified ? new Date() : null },
      select: { id: true, name: true, isVerified: true, verifiedAt: true },
    });
  }

  async recalculateTiers() {
    this.logger.log('Recalculating site tiers...');

    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true }),
      select: {
        id: true,
        bestScore: true,
        bestScoreAt: true,
        _count: { select: { crawlerVisits: { where: { isSeeded: false } } } },
      },
    });

    for (const site of sites) {
      let tier: string | null = null;
      if (site.bestScore >= 80 && site._count.crawlerVisits > 0) {
        tier = 'platinum';
      } else if (site.bestScore >= 80) {
        tier = 'gold';
      } else if (site.bestScore >= 70) {
        tier = 'silver';
      } else if (site.bestScore >= 60) {
        tier = 'bronze';
      }

      await this.prisma.site.update({
        where: { id: site.id },
        data: { tier },
      });
    }

    this.logger.log(`Recalculated tiers for ${sites.length} sites`);
  }

  /**
   * Timeline of public-facing events for a single site — consumed by the
   * per-brand RSS/JSON feeds at /directory/:id/feed and feed.json. Events:
   * completed scans (with score), newly-added Q&As, newly-awarded badges,
   * blog articles about this site.
   *
   * Returns up to `limit` events, newest first, with ISO timestamps.
   */
  async getSiteFeedEvents(siteId: string, limit = 50) {
    const site = await this.prisma.site.findFirst({
      where: publicSiteWhere({ id: siteId, isPublic: true }),
      select: { id: true, name: true, url: true, industry: true, bestScore: true, updatedAt: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    const publicSite = this.withPublicDisplayName(site);

    const [scans, qas, badges, articles] = await Promise.all([
      this.prisma.scan.findMany({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: limit,
        select: { id: true, totalScore: true, completedAt: true },
      }),
      this.prisma.siteQa.findMany({
        where: { siteId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, question: true, answer: true, category: true, createdAt: true },
      }),
      this.prisma.siteBadge.findMany({
        where: { siteId },
        orderBy: { awardedAt: 'desc' },
        take: limit,
        select: { badge: true, label: true, awardedAt: true },
      }),
      this.prisma.blogArticle.findMany({
        where: publicBlogArticleWhere({ siteId, published: true }),
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { slug: true, title: true, description: true, createdAt: true },
      }),
    ]);

    type Event = {
      id: string;
      type: 'scan' | 'qa' | 'badge' | 'article';
      title: string;
      summary: string;
      url?: string;
      timestamp: Date;
      category: string;
    };

    const events: Event[] = [];

    for (const s of scans) {
      if (!s.completedAt) continue;
      events.push({
        id: `scan-${s.id}`,
        type: 'scan',
        title: `${publicSite.name} — GEO 分數更新:${s.totalScore}/100`,
        summary: `${publicSite.name} 於 ${s.completedAt.toISOString().slice(0, 10)} 完成新一次 AI 可見度掃描,最新分數為 ${s.totalScore}/100。`,
        timestamp: s.completedAt,
        category: 'scan',
      });
    }
    for (const q of qas) {
      events.push({
        id: `qa-${q.id}`,
        type: 'qa',
        title: `${publicSite.name} 新增常見問題:${q.question.slice(0, 60)}`,
        summary: q.answer.slice(0, 280),
        timestamp: q.createdAt,
        category: q.category ?? 'qa',
      });
    }
    for (const b of badges) {
      events.push({
        id: `badge-${b.badge}-${b.awardedAt.getTime()}`,
        type: 'badge',
        title: `${publicSite.name} 獲得徽章:${b.label}`,
        summary: `${publicSite.name} 於 ${b.awardedAt.toISOString().slice(0, 10)} 獲得「${b.label}」徽章。`,
        timestamp: b.awardedAt,
        category: 'badge',
      });
    }
    for (const a of articles) {
      events.push({
        id: `article-${a.slug}`,
        type: 'article',
        title: a.title,
        summary: (a.description ?? '').slice(0, 280),
        url: `/blog/${a.slug}`,
        timestamp: a.createdAt,
        category: 'article',
      });
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      site: { id: publicSite.id, name: publicSite.name, url: publicSite.url, industry: publicSite.industry, bestScore: publicSite.bestScore },
      events: events.slice(0, limit),
      lastModified: events[0]?.timestamp ?? site.updatedAt,
    };
  }
}
