import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { TogglePublicDto } from './dto/toggle-public.dto';
import { IndexNowService } from '../indexnow/indexnow.service';

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly indexNowService?: IndexNowService,
  ) {}

  async listDirectory(query: QueryDirectoryDto) {
    const { search, industry, tier, minScore, page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isPublic: true };
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
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLeaderboard() {
    return this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
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
  }

  async getStats() {
    const [totalSites, avgResult, tierCounts] = await Promise.all([
      this.prisma.site.count({ where: { isPublic: true } }),
      this.prisma.site.aggregate({
        where: { isPublic: true },
        _avg: { bestScore: true },
      }),
      this.prisma.site.groupBy({
        by: ['tier'],
        where: { isPublic: true, tier: { not: null } },
        _count: true,
      }),
    ]);

    const tierDistribution: Record<string, number> = {};
    for (const t of tierCounts) {
      if (t.tier) tierDistribution[t.tier] = t._count;
    }

    return {
      totalSites,
      avgScore: Math.round(avgResult._avg.bestScore || 0),
      tierDistribution,
    };
  }

  async getNewcomers() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.site.findMany({
      where: {
        isPublic: true,
        createdAt: { gte: thirtyDaysAgo },
      },
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
      take: 10,
    });
  }

  /** Top 10 sites by crawler visits in the last 24h */
  async getTodayHottest() {
    const oneDayAgo = new Date(Date.now() - 86400000);

    const topSites = await this.prisma.crawlerVisit.groupBy({
      by: ['siteId'],
      where: {
        site: { isPublic: true },
        visitedAt: { gte: oneDayAgo },
      },
      _count: true,
      orderBy: { _count: { siteId: 'desc' } },
      take: 10,
    });

    if (topSites.length === 0) return [];

    const siteIds = topSites.map((s) => s.siteId);
    const sites = await this.prisma.site.findMany({
      where: { id: { in: siteIds } },
      select: { id: true, name: true, url: true, industry: true, tier: true, bestScore: true },
    });

    const siteMap = new Map(sites.map((s) => [s.id, s]));
    return topSites.map((t) => ({
      ...siteMap.get(t.siteId),
      todayVisits: t._count,
    }));
  }

  /** Top 10 sites by total crawler visits (all time) */
  async getMostCrawled() {
    const topSites = await this.prisma.crawlerVisit.groupBy({
      by: ['siteId'],
      where: {
        site: { isPublic: true },
      },
      _count: true,
      orderBy: { _count: { siteId: 'desc' } },
      take: 10,
    });

    if (topSites.length === 0) return [];

    const siteIds = topSites.map((s) => s.siteId);
    const sites = await this.prisma.site.findMany({
      where: { id: { in: siteIds } },
      select: { id: true, name: true, url: true, industry: true, tier: true, bestScore: true },
    });

    const siteMap = new Map(sites.map((s) => [s.id, s]));
    return topSites.map((t) => ({
      ...siteMap.get(t.siteId),
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
        site: { isPublic: true },
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

    return recentScans.map((s) => ({
      ...s.site,
      lastScanScore: s.totalScore,
      lastScanAt: s.completedAt,
    }));
  }

  /** Platform-wide stats for landing page */
  /** Full wiki data for a specific industry */
  async getIndustryWikiData(industrySlug: string) {
    const sites = await this.prisma.site.findMany({
      where: { industry: industrySlug, isPublic: true },
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

    const scores = sites.map((s) => s.bestScore);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

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
    const allScans = sites.map((s) => s.scans[0]).filter(Boolean);

    for (const [key, label] of Object.entries(indicatorNames)) {
      if (allScans.length === 0) {
        indicatorStats[key] = { name: label, passRate: 0 };
      } else {
        const passCount = allScans.filter((scan) =>
          scan.results.some((r) => r.indicator === key && r.status === 'pass'),
        ).length;
        indicatorStats[key] = { name: label, passRate: Math.round((passCount / allScans.length) * 100) };
      }
    }

    const weakestIndicators = Object.entries(indicatorStats)
      .sort((a, b) => a[1].passRate - b[1].passRate)
      .slice(0, 3)
      .map(([key, val]) => ({ key, name: val.name, passRate: val.passRate }));

    const levelDistribution = {
      platinum: sites.filter((s) => s.tier === 'platinum').length,
      gold: sites.filter((s) => s.tier === 'gold').length,
      silver: sites.filter((s) => s.tier === 'silver').length,
      bronze: sites.filter((s) => s.tier === 'bronze').length,
      unrated: sites.filter((s) => !s.tier).length,
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
      topSites: sites.slice(0, 10).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        bestScore: s.bestScore,
        tier: s.tier,
      })),
    };
  }

  /** Stats for a specific industry */
  async getIndustryStats(industry: string) {
    const [totalSites, avgResult, topSites] = await Promise.all([
      this.prisma.site.count({ where: { isPublic: true, industry } }),
      this.prisma.site.aggregate({
        where: { isPublic: true, industry },
        _avg: { bestScore: true },
        _max: { bestScore: true },
      }),
      this.prisma.site.findMany({
        where: { isPublic: true, industry, bestScore: { gt: 0 } },
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
      topSites,
    };
  }

  /** Stats per industry (for overview) */
  async getAllIndustryStats() {
    const stats = await this.prisma.site.groupBy({
      by: ['industry'],
      where: { isPublic: true, industry: { not: null } },
      _count: true,
      _avg: { bestScore: true },
    });

    return stats
      .filter((s) => s.industry)
      .map((s) => ({
        industry: s.industry!,
        count: s._count,
        avgScore: Math.round(s._avg.bestScore || 0),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getPlatformStats() {
    const oneDayAgo = new Date(Date.now() - 86400000);

    const [
      totalPublicSites,
      totalScans,
      totalCrawlerVisits,
      crawlerVisits24h,
      activeBotCount,
    ] = await Promise.all([
      this.prisma.site.count({ where: { isPublic: true } }),
      this.prisma.scan.count({ where: { status: 'COMPLETED' } }),
      this.prisma.crawlerVisit.count(),
      this.prisma.crawlerVisit.count({ where: { visitedAt: { gte: oneDayAgo } } }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: { visitedAt: { gte: oneDayAgo } },
      }).then((r) => r.length),
    ]);

    return {
      totalSites: totalPublicSites,
      totalScans,
      totalCrawlerVisits,
      crawlerVisits24h,
      activeBots: activeBotCount,
    };
  }

  async getCrawlerFeed(limit = 20) {
    const recentVisits = await this.prisma.crawlerVisit.findMany({
      where: {
        site: { isPublic: true },
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
          site: { isPublic: true },
          visitedAt: { gte: oneDayAgo },
        },
      }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: {
          site: { isPublic: true },
          visitedAt: { gte: oneDayAgo },
        },
        _count: true,
      }),
    ]);

    return {
      feed: recentVisits,
      stats: {
        last24h: last24hCount,
        activeBots: activeBots.map((b) => ({
          name: b.botName,
          count: b._count,
        })),
      },
    };
  }

  async getSiteDetail(siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, isPublic: true },
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
        where: { siteId },
        _count: true,
        _max: { visitedAt: true },
      }),
      this.prisma.crawlerVisit.count({ where: { siteId } }),
    ]);

    const { scans, ...siteData } = site;

    return {
      ...siteData,
      latestScan: scans[0] || null,
      scoreTrend: scoreTrend.map((s) => ({
        date: s.completedAt,
        score: s.totalScore,
      })),
      crawlerActivity: {
        totalVisits: totalCrawlerVisits,
        bots: crawlerStats.map((b) => ({
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
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        scans: { some: { status: 'COMPLETED' } },
      },
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
      .filter((s) => s.scans.length >= 2)
      .map((s) => {
        const firstScan = s.scans[0];
        const bestScan = s.scans.reduce((a, b) => (b.totalScore > a.totalScore ? b : a), s.scans[0]);
        const improvement = bestScan.totalScore - firstScan.totalScore;
        const daysBetween = Math.ceil(
          (new Date(bestScan.completedAt!).getTime() - new Date(firstScan.completedAt!).getTime()) / 86400000,
        );

        return {
          id: s.id,
          name: s.name,
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
      .filter((s) => s.improvement > 0)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10);

    return stars;
  }

  async togglePublic(siteId: string, dto: TogglePublicDto) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

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

    return updated;
  }

  async recalculateTiers() {
    this.logger.log('Recalculating site tiers...');

    const sites = await this.prisma.site.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        bestScore: true,
        bestScoreAt: true,
        _count: { select: { crawlerVisits: true } },
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
}
