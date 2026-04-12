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

  /**
   * Record AI crawler visiting Geovault platform itself (from Next.js middleware).
   * No token needed — this is for our own platform, not customer sites.
   */
  async reportPlatformVisit(data: {
    botName: string;
    url: string;
    userAgent: string;
    statusCode: number;
    source?: string;
  }) {
    // Find or get the platform's own site record
    let platformSite = await this.prisma.site.findFirst({
      where: { url: 'https://www.geovault.app' },
      select: { id: true },
    });

    if (!platformSite) {
      // Auto-create a platform site record for tracking
      const adminUser = await this.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!adminUser) return { ok: false, reason: 'no admin user' };

      platformSite = await this.prisma.site.create({
        data: {
          name: 'Geovault Platform',
          url: 'https://www.geovault.app',
          userId: adminUser.id,
          isPublic: true,
          industry: 'technology',
        },
        select: { id: true },
      });
    }

    // Rate limit: 500 per hour for platform
    const oneHourAgo = new Date(Date.now() - 3600000);
    const count = await this.prisma.crawlerVisit.count({
      where: { siteId: platformSite.id, visitedAt: { gte: oneHourAgo } },
    });
    if (count >= 500) return { ok: true, throttled: true };

    const botDef = AI_BOTS.find((b: AiBotDefinition) => b.name === data.botName);

    await this.prisma.crawlerVisit.create({
      data: {
        siteId: platformSite.id,
        botName: data.botName,
        botOrg: botDef?.org || 'Unknown',
        url: data.url,
        statusCode: data.statusCode,
        userAgent: data.userAgent?.slice(0, 500),
        isSeeded: false, // real visit, not simulated
      },
    });

    this.logger.log(`🤖 Real AI crawler: ${data.botName} → ${data.url}`);
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
      botStats: botCounts.map((b: any) => ({
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

  /**
   * Verify tracking snippet installation:
   * 1. Fetch user's site HTML and check if snippet script is present
   * 2. Check if any report has been received for this token
   */
  async verifyInstallation(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, crawlerToken: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (!site.crawlerToken) {
      return { installed: false, reason: 'no_token', message: '尚未產生追蹤碼，請先取得追蹤碼。' };
    }

    const results: { snippetFound: boolean; reportsReceived: number; lastReport: Date | null; details: string } = {
      snippetFound: false,
      reportsReceived: 0,
      lastReport: null,
      details: '',
    };

    // Step 1: Fetch site HTML and check for snippet
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(site.url, {
        headers: { 'User-Agent': 'Geovault-Verifier/1.0' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();
        // Check if our tracking token appears in the page
        if (html.includes(site.crawlerToken) && html.includes('crawler/report')) {
          results.snippetFound = true;
        } else if (html.includes('geo-saas') || html.includes('geovault')) {
          results.details = '偵測到 Geovault 相關代碼，但追蹤碼的 Token 不正確或不完整。';
        }
      } else {
        results.details = `網站回應 ${res.status}，無法驗證。`;
      }
    } catch (err: any) {
      results.details = err.name === 'AbortError'
        ? '網站連線逾時（10 秒），請確認網址可正常存取。'
        : `無法連線到 ${site.url}：${err.message}`;
    }

    // Step 2: Check if any reports have been received
    const reportsCount = await this.prisma.crawlerVisit.count({
      where: { siteId },
    });
    results.reportsReceived = reportsCount;

    if (reportsCount > 0) {
      const latest = await this.prisma.crawlerVisit.findFirst({
        where: { siteId },
        orderBy: { visitedAt: 'desc' },
        select: { visitedAt: true },
      });
      results.lastReport = latest?.visitedAt || null;
    }

    // Build verdict
    if (results.snippetFound && results.reportsReceived > 0) {
      return {
        installed: true,
        verified: true,
        message: '追蹤碼安裝正確，已收到爬蟲回報。',
        ...results,
      };
    } else if (results.snippetFound) {
      return {
        installed: true,
        verified: false,
        message: '追蹤碼已安裝，但尚未收到任何 AI 爬蟲回報。這是正常的，等待 AI 爬蟲造訪即可。',
        ...results,
      };
    } else if (results.reportsReceived > 0) {
      return {
        installed: true,
        verified: true,
        message: '已收到爬蟲回報，追蹤碼運作正常。（HTML 中未直接偵測到代碼，可能是透過 Tag Manager 載入。）',
        ...results,
      };
    } else {
      return {
        installed: false,
        verified: false,
        message: results.details || '未在網站中偵測到追蹤碼，且尚未收到任何回報。請確認追蹤碼已正確貼入網站 HTML。',
        ...results,
      };
    }
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
