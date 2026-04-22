import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import pLimit from 'p-limit';

interface CsvRow {
  url: string;
  brandName: string;
  industry: string;
  country: string;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scanPipeline: ScanPipelineService,
  ) {}

  /** Get seeding status overview */
  async getStatus() {
    const [total, scanned, pending, failed] = await Promise.all([
      this.prisma.seedSource.count(),
      this.prisma.seedSource.count({ where: { status: 'scanned' } }),
      this.prisma.seedSource.count({ where: { status: 'pending' } }),
      this.prisma.seedSource.count({ where: { status: 'failed' } }),
    ]);

    const byIndustry = await this.prisma.seedSource.groupBy({
      by: ['industry'],
      where: { status: 'scanned' },
      _count: true,
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      crawlerTotal, crawlerReal, crawlerSeeded,
      real24h, seeded24h, real7d, seeded7d,
    ] = await Promise.all([
      this.prisma.crawlerVisit.count(),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: true } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false, visitedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: true, visitedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false, visitedAt: { gte: sevenDaysAgo } } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: true, visitedAt: { gte: sevenDaysAgo } } }),
    ]);

    // Bot breakdown: real vs seeded per bot
    const [realByBot, seededByBot] = await Promise.all([
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: { isSeeded: false },
        _count: true,
        orderBy: { _count: { botName: 'desc' } },
      }),
      this.prisma.crawlerVisit.groupBy({
        by: ['botName'],
        where: { isSeeded: true },
        _count: true,
        orderBy: { _count: { botName: 'desc' } },
      }),
    ]);

    // Recent real visits (last 20)
    const recentRealVisits = await this.prisma.crawlerVisit.findMany({
      where: { isSeeded: false },
      orderBy: { visitedAt: 'desc' },
      take: 20,
      select: {
        botName: true,
        botOrg: true,
        visitedAt: true,
        statusCode: true,
        site: { select: { name: true, url: true } },
      },
    });

    const blogCount = await this.prisma.blogArticle.count({ where: { published: true } });

    return {
      total,
      scanned,
      pending,
      failed,
      isRunning: this.isRunning,
      byIndustry: byIndustry.map((b: any) => ({ industry: b.industry, count: b._count })),
      crawler: {
        total: crawlerTotal,
        real: crawlerReal,
        seeded: crawlerSeeded,
        real24h,
        seeded24h,
        real7d,
        seeded7d,
        realByBot: realByBot.map((b: any) => ({ bot: b.botName, count: b._count })),
        seededByBot: seededByBot.map((b: any) => ({ bot: b.botName, count: b._count })),
        recentRealVisits,
      },
      blogArticles: blogCount,
    };
  }

  /** Get all failed seed sources */
  async getFailed() {
    return this.prisma.seedSource.findMany({
      where: { status: 'failed' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Import CSV files into SeedSource table */
  async importCsvFiles(files?: string[]): Promise<{ imported: number }> {
    // Try multiple possible paths (dev vs Docker)
    const candidates = [
      path.resolve(process.cwd(), '../../scripts/seed-data'),  // dev: apps/api/
      path.resolve(process.cwd(), 'scripts/seed-data'),        // Docker: /app/
      path.resolve(process.cwd(), '../scripts/seed-data'),     // fallback
    ];
    const seedDataDir = candidates.find((p) => fs.existsSync(p)) || candidates[0];

    let csvFiles: string[];
    if (files && files.length > 0) {
      csvFiles = files.map((f) => path.resolve(seedDataDir, f));
    } else {
      if (!fs.existsSync(seedDataDir)) return { imported: 0 };
      csvFiles = fs.readdirSync(seedDataDir)
        .filter((f) => f.endsWith('.csv'))
        .map((f) => path.join(seedDataDir, f));
    }

    let imported = 0;
    for (const filePath of csvFiles) {
      if (!fs.existsSync(filePath)) continue;
      const rows = await this.parseCsv(filePath);
      this.logger.log(`Processing ${path.basename(filePath)}: ${rows.length} rows`);

      for (const row of rows) {
        try {
          await this.prisma.seedSource.upsert({
            where: { url: row.url },
            update: {},
            create: {
              url: row.url,
              brandName: row.brandName,
              industry: row.industry,
              country: row.country,
              source: 'manual',
              status: 'pending',
            },
          });
          imported++;
        } catch {
          // duplicate or error, skip
        }
      }
    }

    return { imported };
  }

  /** Run scanning for all pending seeds */
  async runScanning(): Promise<{ scanned: number; failed: number }> {
    if (this.isRunning) {
      return { scanned: 0, failed: 0 };
    }

    this.isRunning = true;
    this.logger.log('Starting seed scanning...');

    try {
      const pendingSeeds = await this.prisma.seedSource.findMany({
        where: { status: 'pending' },
      });

      const limit = pLimit(3);
      let scanned = 0;
      let failed = 0;

      // Need a system user for site creation
      let systemUser = await this.prisma.user.findFirst({
        where: { email: 'system@geovault.local' },
      });
      if (!systemUser) {
        systemUser = await this.prisma.user.create({
          data: {
            email: 'system@geovault.local',
            name: 'Geovault System',
            passwordHash: 'SYSTEM_NO_LOGIN',
          },
        });
      }

      await Promise.all(
        pendingSeeds.map((seed: any) =>
          limit(async () => {
            try {
              // Find or create site
              let site = await this.prisma.site.findFirst({
                where: { url: seed.url },
              });

              if (!site) {
                site = await this.prisma.site.create({
                  data: {
                    url: seed.url,
                    name: seed.brandName,
                    userId: systemUser!.id,
                    industry: seed.industry,
                    isPublic: true,
                  },
                });
              }

              // Create scan and execute
              const scan = await this.prisma.scan.create({
                data: { siteId: site.id, status: 'PENDING' },
              });

              await this.scanPipeline.executeScan(scan.id, seed.url);

              await this.prisma.seedSource.update({
                where: { id: seed.id },
                data: { status: 'scanned', siteId: site.id },
              });

              scanned++;
              this.logger.log(`✓ [${scanned}/${pendingSeeds.length}] ${seed.brandName}`);
            } catch (err) {
              failed++;
              await this.prisma.seedSource.update({
                where: { id: seed.id },
                data: {
                  status: 'failed',
                  failReason: err instanceof Error ? err.message : String(err),
                },
              });
              this.logger.warn(`✗ ${seed.brandName}: ${err instanceof Error ? err.message : err}`);
            }
          }),
        ),
      );

      this.logger.log(`Seed scanning complete: ${scanned} scanned, ${failed} failed`);
      return { scanned, failed };
    } finally {
      this.isRunning = false;
    }
  }

  /** Retry all failed seeds */
  /** Seed realistic crawler visit data for public sites */
  async seedCrawlerVisits(): Promise<{ created: number }> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: { id: true, url: true, bestScore: true },
    });

    const bots = [
      { name: 'GPTBot', org: 'OpenAI' },
      { name: 'ClaudeBot', org: 'Anthropic' },
      { name: 'PerplexityBot', org: 'Perplexity' },
      { name: 'Google-Extended', org: 'Google' },
      { name: 'Bingbot', org: 'Microsoft' },
      { name: 'CopilotBot', org: 'Microsoft' },
      { name: 'Bytespider', org: 'ByteDance' },
    ];

    let created = 0;
    const now = Date.now();

    for (const site of sites) {
      // Higher score sites get more visits
      const visitCount = Math.floor((site.bestScore / 20) + Math.random() * 5) + 1;

      for (let i = 0; i < visitCount; i++) {
        const bot = bots[Math.floor(Math.random() * bots.length)];
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        const visitedAt = new Date(now - (daysAgo * 86400000) - (hoursAgo * 3600000));

        try {
          await this.prisma.crawlerVisit.create({
            data: {
              siteId: site.id,
              botName: bot.name,
              botOrg: bot.org,
              url: site.url,
              userAgent: `Mozilla/5.0 (compatible; ${bot.name}/1.0; +https://${bot.org.toLowerCase()}.com/bot)`,
              statusCode: 200,
              isSeeded: true,
              visitedAt,
            },
          });
          created++;
        } catch {
          // skip duplicates
        }
      }
    }

    this.logger.log(`Seeded ${created} crawler visits for ${sites.length} sites`);
    return { created };
  }

  /**
   * Register Geovault's own site (www.geovault.app) as a scannable site owned
   * by admin@geovault.app, then trigger an initial scan. Idempotent — safe to
   * call repeatedly. Returns the site and the newly-created scan record.
   */
  async seedGeovaultSelf(): Promise<{
    site: { id: string; url: string; name: string };
    scan: { id: string; status: string };
  }> {
    const admin = await this.prisma.user.findUnique({
      where: { email: 'admin@geovault.app' },
    });
    if (!admin) {
      throw new Error('Admin user admin@geovault.app not found — cannot seed self.');
    }

    const url = 'https://www.geovault.app';

    let site = await this.prisma.site.findFirst({ where: { url } });
    if (!site) {
      site = await this.prisma.site.create({
        data: {
          url,
          name: 'Geovault',
          userId: admin.id,
          industry: 'technology',
          isPublic: true,
          isClient: true,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      this.logger.log(`Created Geovault self-site ${site.id}`);
    } else {
      site = await this.prisma.site.update({
        where: { id: site.id },
        data: {
          isPublic: true,
          isClient: true,
          isVerified: true,
          verifiedAt: site.verifiedAt ?? new Date(),
        },
      });
      this.logger.log(`Updated existing Geovault self-site ${site.id}`);
    }

    const scan = await this.prisma.scan.create({
      data: { siteId: site.id, status: 'PENDING' },
    });

    this.scanPipeline.executeScan(scan.id, url).catch((err) => {
      this.logger.error(
        `Geovault self-scan ${scan.id} failed: ${err instanceof Error ? err.stack : err}`,
      );
    });

    return {
      site: { id: site.id, url: site.url, name: site.name },
      scan: { id: scan.id, status: scan.status },
    };
  }

  // ─── Continuous Simulation ─────────────────────────────────────────

  private readonly bots = [
    { name: 'GPTBot', org: 'OpenAI' },
    { name: 'ClaudeBot', org: 'Anthropic' },
    { name: 'PerplexityBot', org: 'Perplexity' },
    { name: 'Google-Extended', org: 'Google' },
    { name: 'Bingbot', org: 'Microsoft' },
    { name: 'CopilotBot', org: 'Microsoft' },
    { name: 'Bytespider', org: 'ByteDance' },
  ];

  /**
   * Every 10 minutes: simulate a batch of fresh crawler visits.
   * This keeps "今日AI關注", "即時AI爬蟲動態", crawler marquee alive.
   * Higher-score sites get more frequent visits (realistic behavior).
   */
  @Cron('*/10 * * * *')
  async simulateLiveCrawlerActivity(): Promise<{ created: number }> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: { id: true, url: true, bestScore: true },
    });

    if (sites.length === 0) return { created: 0 };

    let created = 0;
    const now = Date.now();

    // Each cycle: pick ~8-15% of sites randomly, weighted by score
    for (const site of sites) {
      // Higher score = higher chance of being visited in this cycle
      const visitChance = (site.bestScore / 100) * 0.15;
      if (Math.random() > visitChance) continue;

      // 1-3 bot visits per site per cycle
      const visitCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < visitCount; i++) {
        const bot = this.bots[Math.floor(Math.random() * this.bots.length)];
        // Spread visits within the last 10 minutes
        const minutesAgo = Math.random() * 10;
        const visitedAt = new Date(now - minutesAgo * 60000);

        try {
          await this.prisma.crawlerVisit.create({
            data: {
              siteId: site.id,
              botName: bot.name,
              botOrg: bot.org,
              url: site.url,
              userAgent: `Mozilla/5.0 (compatible; ${bot.name}/1.0; +https://${bot.org.toLowerCase()}.com/bot)`,
              statusCode: 200,
              isSeeded: true,
              visitedAt,
            },
          });
          created++;
        } catch {
          // skip
        }
      }
    }

    if (created > 0) {
      this.logger.log(`Simulated ${created} live crawler visits`);
    }
    return { created };
  }

  /**
   * Every day at 01:00: simulate "progress stars" by creating a second scan
   * with a slightly improved score for some sites that only have 1 scan.
   * This keeps "進步之星" populated.
   */
  @Cron('0 1 * * *')
  async simulateProgressData(): Promise<{ improved: number }> {
    // Find public sites with exactly 1 completed scan
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0, lt: 95 },
      },
      select: {
        id: true,
        bestScore: true,
        _count: { select: { scans: { where: { status: 'COMPLETED' } } } },
      },
    });

    const singleScanSites = sites.filter((s) => s._count.scans === 1);
    if (singleScanSites.length === 0) return { improved: 0 };

    // Pick ~5-10 sites randomly each day
    const shuffled = singleScanSites.sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, Math.min(8, shuffled.length));
    let improved = 0;

    for (const site of batch) {
      // Improve score by 5-20 points
      const improvement = 5 + Math.floor(Math.random() * 16);
      const newScore = Math.min(100, site.bestScore + improvement);

      try {
        // Create a simulated "improved" scan
        await this.prisma.scan.create({
          data: {
            siteId: site.id,
            status: 'COMPLETED',
            totalScore: newScore,
            completedAt: new Date(),
          },
        });

        // Update bestScore
        await this.prisma.site.update({
          where: { id: site.id },
          data: {
            bestScore: newScore,
            bestScoreAt: new Date(),
          },
        });

        improved++;
      } catch {
        // skip
      }
    }

    if (improved > 0) {
      this.logger.log(`Simulated progress for ${improved} sites`);
    }
    return { improved };
  }

  /**
   * Every 6 hours: refresh "最近更新" by creating a rescan for some sites.
   * This keeps the "Recently Active" tab populated with fresh data.
   */
  @Cron('0 */6 * * *')
  async simulateRecentScans(): Promise<{ refreshed: number }> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: { id: true, bestScore: true },
      orderBy: { bestScore: 'desc' },
    });

    if (sites.length === 0) return { refreshed: 0 };

    // Pick 5-15 random sites each cycle
    const shuffled = sites.sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, Math.min(12, shuffled.length));
    let refreshed = 0;

    for (const site of batch) {
      // Score fluctuates slightly (-3 to +3)
      const fluctuation = Math.floor(Math.random() * 7) - 3;
      const score = Math.max(0, Math.min(100, site.bestScore + fluctuation));

      try {
        await this.prisma.scan.create({
          data: {
            siteId: site.id,
            status: 'COMPLETED',
            totalScore: score,
            completedAt: new Date(),
          },
        });

        // Update bestScore if improved
        if (score > site.bestScore) {
          await this.prisma.site.update({
            where: { id: site.id },
            data: { bestScore: score, bestScoreAt: new Date() },
          });
        }

        refreshed++;
      } catch {
        // skip
      }
    }

    if (refreshed > 0) {
      this.logger.log(`Simulated ${refreshed} recent scan refreshes`);
    }
    return { refreshed };
  }

  async retryFailed(): Promise<{ reset: number }> {
    const result = await this.prisma.seedSource.updateMany({
      where: { status: 'failed' },
      data: { status: 'pending', failReason: null },
    });
    return { reset: result.count };
  }

  private async parseCsv(filePath: string): Promise<CsvRow[]> {
    const results: CsvRow[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let isFirstLine = true;
    for await (const line of rl) {
      if (isFirstLine) { isFirstLine = false; continue; }
      const [url, brandName, industry, country] = line.split(',').map((s) => s.trim());
      if (url && brandName) {
        results.push({ url, brandName, industry, country: country || 'TW' });
      }
    }
    return results;
  }
}
