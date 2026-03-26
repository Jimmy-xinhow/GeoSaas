import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface BadgeDef {
  badge: string;
  label: string;
  check: (ctx: BadgeContext) => boolean;
}

interface BadgeContext {
  bestScore: number;
  scanCount: number;
  hasCrawlerVisits: boolean;
  isTop10: boolean;
  scoreImprovement: number;
}

const BADGE_DEFINITIONS: BadgeDef[] = [
  { badge: 'first_scan', label: '首次掃描', check: (ctx) => ctx.scanCount >= 1 },
  { badge: 'score_50', label: 'GEO 50+', check: (ctx) => ctx.bestScore >= 50 },
  { badge: 'score_60', label: 'GEO 60+', check: (ctx) => ctx.bestScore >= 60 },
  { badge: 'score_70', label: 'GEO 70+', check: (ctx) => ctx.bestScore >= 70 },
  { badge: 'score_80', label: 'GEO 80+', check: (ctx) => ctx.bestScore >= 80 },
  { badge: 'score_90', label: 'GEO 90+', check: (ctx) => ctx.bestScore >= 90 },
  { badge: 'score_100', label: '滿分達成', check: (ctx) => ctx.bestScore >= 100 },
  { badge: 'crawler_visited', label: 'AI 爬蟲造訪', check: (ctx) => ctx.hasCrawlerVisits },
  { badge: 'top_10', label: 'Top 10 排行', check: (ctx) => ctx.isTop10 },
  { badge: 'improver_10', label: '進步 10+', check: (ctx) => ctx.scoreImprovement >= 10 },
  { badge: 'improver_30', label: '進步 30+', check: (ctx) => ctx.scoreImprovement >= 30 },
  { badge: 'scan_5', label: '5 次掃描', check: (ctx) => ctx.scanCount >= 5 },
  { badge: 'scan_10', label: '10 次掃描', check: (ctx) => ctx.scanCount >= 10 },
];

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Evaluate and award badges for a site after scan completion */
  async evaluateBadges(siteId: string): Promise<string[]> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        bestScore: true,
        _count: {
          select: {
            scans: { where: { status: 'COMPLETED' } },
            crawlerVisits: true,
          },
        },
        badges: { select: { badge: true } },
      },
    });

    if (!site) return [];

    // Calculate score improvement
    const scans = await this.prisma.scan.findMany({
      where: { siteId, status: 'COMPLETED' },
      orderBy: { completedAt: 'asc' },
      select: { totalScore: true },
      take: 50,
    });
    const firstScore = scans.length > 0 ? scans[0].totalScore : 0;
    const scoreImprovement = site.bestScore - firstScore;

    // Check if in top 10
    const top10 = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      orderBy: { bestScore: 'desc' },
      take: 10,
      select: { id: true },
    });
    const isTop10 = top10.some((s) => s.id === siteId);

    const ctx: BadgeContext = {
      bestScore: site.bestScore,
      scanCount: site._count.scans,
      hasCrawlerVisits: site._count.crawlerVisits > 0,
      isTop10,
      scoreImprovement,
    };

    const existingBadges = new Set(site.badges.map((b) => b.badge));
    const newBadges: string[] = [];

    for (const def of BADGE_DEFINITIONS) {
      if (!existingBadges.has(def.badge) && def.check(ctx)) {
        try {
          await this.prisma.siteBadge.create({
            data: { siteId, badge: def.badge, label: def.label },
          });
          newBadges.push(def.badge);
        } catch {
          // unique constraint — already exists
        }
      }
    }

    if (newBadges.length > 0) {
      this.logger.log(`Awarded ${newBadges.length} badges to site ${siteId}: ${newBadges.join(', ')}`);
    }

    return newBadges;
  }

  /** Get badges for a site */
  async getSiteBadges(siteId: string) {
    return this.prisma.siteBadge.findMany({
      where: { siteId },
      orderBy: { awardedAt: 'asc' },
      select: { badge: true, label: true, awardedAt: true },
    });
  }
}
