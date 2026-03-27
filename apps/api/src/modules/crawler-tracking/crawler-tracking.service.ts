import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RobotsParserService } from './robots-parser.service';
import { SnippetGeneratorService } from './snippet-generator.service';
import { ReportVisitDto } from './dto/report-visit.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';
import { AI_BOTS, AiBotDefinition } from '@geovault/shared';
import { randomBytes } from 'crypto';

@Injectable()
export class CrawlerTrackingService {
  private readonly logger = new Logger(CrawlerTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly robotsParser: RobotsParserService,
    private readonly snippetGen: SnippetGeneratorService,
  ) {}

  async reportVisit(dto: ReportVisitDto) {
    // Validate token
    const site = await this.prisma.site.findUnique({
      where: { crawlerToken: dto.token },
      select: { id: true },
    });
    if (!site) throw new BadRequestException('Invalid token');

    // Rate limit: 1000 per site per hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const count = await this.prisma.crawlerVisit.count({
      where: { siteId: site.id, visitedAt: { gte: oneHourAgo } },
    });
    if (count >= 1000) {
      this.logger.warn(`Rate limit reached for site ${site.id}`);
      return { ok: true, throttled: true };
    }

    // Resolve bot org
    const botDef = AI_BOTS.find((b: AiBotDefinition) => b.name === dto.botName);

    await this.prisma.crawlerVisit.create({
      data: {
        siteId: site.id,
        botName: dto.botName,
        botOrg: botDef?.org || 'Unknown',
        url: dto.url,
        statusCode: dto.statusCode,
        userAgent: dto.userAgent,
      },
    });

    return { ok: true };
  }

  async getDashboard(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, crawlerToken: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);

    const [totalVisits, last24h, botCounts, recentVisits] = await Promise.all([
      this.prisma.crawlerVisit.count({ where: { siteId } }),
      this.prisma.crawlerVisit.count({
        where: { siteId, visitedAt: { gte: oneDayAgo } },
      }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: { siteId },
        _count: true,
        _max: { visitedAt: true },
      }),
      this.prisma.crawlerVisit.findMany({
        where: { siteId },
        orderBy: { visitedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          botName: true,
          botOrg: true,
          url: true,
          statusCode: true,
          visitedAt: true,
        },
      }),
    ]);

    const uniqueBots = botCounts.length;

    // Get latest robots check
    const latestRobotsCheck = await this.prisma.crawlerRobotsCheck.findFirst({
      where: { siteId },
      orderBy: { checkedAt: 'desc' },
    });

    return {
      totalVisits,
      last24h,
      uniqueBots,
      robotsStatus: latestRobotsCheck ? 'checked' : 'unchecked',
      botStats: botCounts.map((b) => ({
        botName: b.botName,
        count: b._count,
        lastVisit: b._max.visitedAt,
      })),
      recentVisits,
      hasToken: !!site.crawlerToken,
    };
  }

  async getStats(siteId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const visits = await this.prisma.crawlerVisit.findMany({
      where: { siteId, visitedAt: { gte: thirtyDaysAgo } },
      select: { visitedAt: true, botName: true },
      orderBy: { visitedAt: 'asc' },
    });

    // Group by day
    const dailyMap = new Map<string, { total: number; bots: Record<string, number> }>();
    for (const v of visits) {
      const day = v.visitedAt.toISOString().split('T')[0];
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { total: 0, bots: {} });
      }
      const entry = dailyMap.get(day)!;
      entry.total++;
      entry.bots[v.botName] = (entry.bots[v.botName] || 0) + 1;
    }

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  async getRobots(siteId: string) {
    const check = await this.prisma.crawlerRobotsCheck.findFirst({
      where: { siteId },
      orderBy: { checkedAt: 'desc' },
    });
    if (!check) return { robotsTxt: null, allowedBots: null, sitemapUrls: null, checkedAt: null };
    return check;
  }

  async getSnippet(siteId: string) {
    let site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, crawlerToken: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    // Auto-generate token if not exists
    if (!site.crawlerToken) {
      const token = randomBytes(24).toString('hex');
      site = await this.prisma.site.update({
        where: { id: siteId },
        data: { crawlerToken: token },
        select: { id: true, crawlerToken: true },
      });
    }

    const snippet = this.snippetGen.generate(siteId, site.crawlerToken!);
    return { snippet, token: site.crawlerToken };
  }

  async regenerateToken(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const token = randomBytes(24).toString('hex');
    await this.prisma.site.update({
      where: { id: siteId },
      data: { crawlerToken: token },
    });

    const snippet = this.snippetGen.generate(siteId, token);
    return { snippet, token };
  }

  // Scheduler methods
  async checkAllRobots() {
    this.logger.log('Running daily robots.txt checks...');
    const sites = await this.prisma.site.findMany({
      where: { crawlerToken: { not: null } },
      select: { id: true, url: true },
    });

    for (const site of sites) {
      try {
        const result = await this.robotsParser.fetchAndParse(site.url);
        await this.prisma.crawlerRobotsCheck.create({
          data: {
            siteId: site.id,
            robotsTxt: result.robotsTxt,
            allowedBots: result.allowedBots,
            sitemapUrls: result.sitemapUrls,
          },
        });
      } catch (err) {
        this.logger.warn(`Robots check failed for site ${site.id}: ${err}`);
      }
    }
    this.logger.log(`Robots checks completed for ${sites.length} sites`);
  }

  async cleanupOldVisits() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.crawlerVisit.deleteMany({
      where: { visitedAt: { lt: ninetyDaysAgo } },
    });
    this.logger.log(`Cleaned up ${result.count} old crawler visits`);
  }
}
