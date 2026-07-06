import { ForbiddenException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { canAccessSite } from '../../common/auth/site-access';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-types';

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
export class BadgeService implements OnModuleDestroy {
  private readonly logger = new Logger(BadgeService.name);
  private readonly redis: Redis | null;
  private redisAvailable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis badge cache unavailable: ${err.message}`);
        this.redisAvailable = false;
        this.redis?.disconnect();
      });
    } catch (err) {
      this.logger.warn(`Redis badge cache init failed: ${err}`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis?.quit();
    } catch {
      // Process is exiting; ignore Redis shutdown errors.
    }
  }

  private badgeCacheKey(siteId: string): string {
    return `badge:svg:${siteId}`;
  }

  async invalidateSvgBadge(siteId: string): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;
    try {
      await this.redis.del(this.badgeCacheKey(siteId));
    } catch (err) {
      this.logger.warn(`Redis badge delete failed for site ${siteId}: ${err}`);
    }
  }

  /** Evaluate and award badges for a site after scan completion */
  async evaluateBadges(siteId: string): Promise<string[]> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        bestScore: true,
        userId: true,
        name: true,
        _count: {
          select: {
            scans: { where: { status: 'COMPLETED' } },
            crawlerVisits: { where: { isSeeded: false } },
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
    const isTop10 = top10.some((s: any) => s.id === siteId);

    const ctx: BadgeContext = {
      bestScore: site.bestScore,
      scanCount: site._count.scans,
      hasCrawlerVisits: site._count.crawlerVisits > 0,
      isTop10,
      scoreImprovement,
    };

    const existingBadges = new Set(site.badges.map((b: any) => b.badge));
    const newBadges: string[] = [];

    for (const def of BADGE_DEFINITIONS) {
      if (!existingBadges.has(def.badge) && def.check(ctx)) {
        try {
          await this.prisma.siteBadge.create({
            data: { siteId, badge: def.badge, label: def.label },
          });
          newBadges.push(def.badge);

          // Notify owner only for newly awarded badges (existing ones never reach here)
          if (site.userId) {
            this.notificationsService
              .create(site.userId, NotificationType.BADGE_EARNED, site.name, def.label)
              .catch((err) => {
                this.logger.warn(`Badge-earned notification failed for site ${siteId}: ${err}`);
              });
          }
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
      where: { siteId, site: { isPublic: true } },
      orderBy: { awardedAt: 'asc' },
      select: { badge: true, label: true, awardedAt: true },
    });
  }

  /** Generate an SVG badge image for a site */
  async generateSvgBadge(siteId: string): Promise<string | null> {
    const cacheKey = this.badgeCacheKey(siteId);
    if (this.redis && this.redisAvailable) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;
      } catch (err) {
        this.logger.warn(`Redis badge read failed for site ${siteId}: ${err}`);
      }
    }

    const site = await this.prisma.site.findFirst({
      where: { id: siteId, isPublic: true },
      select: { name: true, bestScore: true, tier: true },
    });

    if (!site) return null;

    const score = site.bestScore;
    const level = site.tier
      ? site.tier.charAt(0).toUpperCase() + site.tier.slice(1)
      : 'Unrated';

    const colors: Record<string, { bg: string }> = {
      Platinum: { bg: '#1a56db' },
      Gold: { bg: '#d97706' },
      Silver: { bg: '#6b7280' },
      Bronze: { bg: '#92400e' },
    };
    const color = colors[level] ?? { bg: '#374151' };

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="20" role="img" aria-label="GEO Score: ${score}">
  <title>GEO Score: ${score}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="148" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="88" height="20" fill="#555"/>
    <rect x="88" width="60" height="20" fill="${color.bg}"/>
    <rect width="148" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
    <text x="445" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="780" lengthAdjust="spacing">GEO Score</text>
    <text x="445" y="140" transform="scale(.1)" textLength="780" lengthAdjust="spacing">GEO Score</text>
    <text x="1175" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="500" lengthAdjust="spacing">${score}</text>
    <text x="1175" y="140" transform="scale(.1)" textLength="500" lengthAdjust="spacing">${score}</text>
  </g>
</svg>`;

    if (this.redis && this.redisAvailable) {
      try {
        await this.redis.set(cacheKey, svg, 'EX', 3600);
      } catch (err) {
        this.logger.warn(`Redis badge write failed for site ${siteId}: ${err}`);
      }
    }

    return svg;
  }

  /** Get embed code snippets for a site badge */
  async getEmbedCode(siteId: string, userId?: string, role?: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { bestScore: true, isPublic: true, userId: true, isClient: true },
    });

    if (!site) {
      return {
        available: false,
        reason: 'site_not_found',
        message: '找不到此網站。',
      };
    }

    if (!canAccessSite(site, userId, role)) {
      throw new ForbiddenException('You do not have access to this site');
    }

    if (!site.isPublic) {
      return {
        available: false,
        reason: 'site_not_public',
        message: '此網站尚未公開，因此暫時無法產生公開 Badge。',
      };
    }

    const apiUrl = process.env.API_PUBLIC_URL || 'https://api.geovault.app';
    const webUrl = process.env.FRONTEND_URL || 'https://www.geovault.app';
    const score = site.bestScore;

    const imgTag = `<a href="${webUrl}/directory/${siteId}" target="_blank" rel="noopener">\n  <img src="${apiUrl}/api/badge/${siteId}.svg" alt="GEO Score: ${score} | Verified by Geovault" width="148" height="20">\n</a>`;
    const iframeTag = imgTag;
    const markdownBadge = `[![GEO Score: ${score}](${apiUrl}/api/badge/${siteId}.svg)](${webUrl}/directory/${siteId})`;

    return { available: true, imgTag, iframeTag, markdownBadge, svgUrl: `${apiUrl}/api/badge/${siteId}.svg` };
  }
}
