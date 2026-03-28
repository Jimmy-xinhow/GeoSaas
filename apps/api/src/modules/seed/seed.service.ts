import { Injectable, Logger } from '@nestjs/common';
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

    const [crawlerTotal, crawlerReal, crawlerSeeded] = await Promise.all([
      this.prisma.crawlerVisit.count(),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: true } }),
    ]);

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
