import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import pLimit from '@/common/utils/p-limit';

interface CsvRow {
  url: string;
  brandName: string;
  industry: string;
  country: string;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private readonly publicSeedScoreThreshold = 60;
  private isRunning = false;
  private statusCache: { expiresAt: number; data: any } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scanPipeline: ScanPipelineService,
  ) {}

  /** Get seeding status overview */
  async getStatus() {
    if (this.statusCache && this.statusCache.expiresAt > Date.now()) {
      return {
        ...this.statusCache.data,
        isRunning: this.isRunning,
      };
    }

    const [
      total,
      scanned,
      pending,
      failed,
      publicSites,
      users,
      blogArticles,
      lowQualityPublicSeeds,
      eligiblePublicSeedSites,
      privateLowQualitySeedSites,
    ] = await Promise.all([
      this.prisma.seedSource.count(),
      this.prisma.seedSource.count({ where: { status: 'scanned' } }),
      this.prisma.seedSource.count({ where: { status: 'pending' } }),
      this.prisma.seedSource.count({ where: { status: 'failed' } }),
      this.prisma.site.count({ where: { isPublic: true } }),
      this.prisma.user.count(),
      this.prisma.blogArticle.count({ where: { published: true } }),
      this.prisma.site.count({
        where: {
          isPublic: true,
          isClient: false,
          bestScore: { lt: this.publicSeedScoreThreshold },
          user: { is: { email: 'system@geovault.local' } },
          seedSource: { is: { status: 'scanned' } },
        },
      }),
      this.prisma.site.count({
        where: {
          isPublic: true,
          isClient: false,
          bestScore: { gte: this.publicSeedScoreThreshold },
          user: { is: { email: 'system@geovault.local' } },
          seedSource: { is: { status: 'scanned' } },
        },
      }),
      this.prisma.site.count({
        where: {
          isPublic: false,
          isClient: false,
          bestScore: { lt: this.publicSeedScoreThreshold },
          user: { is: { email: 'system@geovault.local' } },
          seedSource: { is: { status: 'scanned' } },
        },
      }),
    ]);

    const byIndustry = await this.prisma.seedSource.groupBy({
      by: ['industry'],
      where: { status: 'scanned' },
      _count: true,
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [crawlerTotal, real24h, real7d] = await Promise.all([
      this.prisma.crawlerVisit.count({ where: { isSeeded: false } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false, visitedAt: { gte: twentyFourHoursAgo } } }),
      this.prisma.crawlerVisit.count({ where: { isSeeded: false, visitedAt: { gte: sevenDaysAgo } } }),
    ]);

    const realByBot = await this.prisma.crawlerVisit.groupBy({
      by: ['botName'],
      where: { isSeeded: false },
      _count: true,
      orderBy: { _count: { botName: 'desc' } },
    });

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

    const data = {
      total,
      scanned,
      pending,
      failed,
      isRunning: this.isRunning,
      byIndustry: byIndustry.map((b: any) => ({ industry: b.industry, count: b._count })),
      crawler: {
        total: crawlerTotal,
        real: crawlerTotal,
        real24h,
        real7d,
        realByBot: realByBot.map((b: any) => ({ bot: b.botName, count: b._count })),
        recentRealVisits,
      },
      sites: {
        public: publicSites,
      },
      seedQuality: {
        publicScoreThreshold: this.publicSeedScoreThreshold,
        lowQualityPublicSeeds,
        eligiblePublicSeedSites,
        privateLowQualitySeedSites,
      },
      users: {
        total: users,
      },
      blogArticles,
    };
    this.statusCache = { data, expiresAt: Date.now() + 30_000 };
    return data;
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
    this.statusCache = null;
    // Try multiple possible paths (dev vs Docker)
    const candidates = [
      path.resolve(process.cwd(), '../../scripts/seed-data'),  // dev: apps/api/
      path.resolve(process.cwd(), 'scripts/seed-data'),        // Docker: /app/
      path.resolve(process.cwd(), '../scripts/seed-data'),     // fallback
    ];
    const seedDataDir = candidates.find((p) => fs.existsSync(p)) || candidates[0];

    let csvFiles: string[];
    if (files && files.length > 0) {
      csvFiles = files.map((f) => {
        if (path.isAbsolute(f) || f.includes('..') || path.basename(f) !== f || !f.endsWith('.csv')) {
          throw new BadRequestException('Invalid seed CSV filename');
        }
        return path.join(seedDataDir, f);
      });
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

    this.statusCache = null;
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
                    isPublic: false,
                  },
                });
              }

              // Create scan and execute
              const scan = await this.prisma.scan.create({
                data: { siteId: site.id, status: 'PENDING' },
              });

              await this.scanPipeline.executeScan(scan.id, seed.url);

              const scoredSite = await this.prisma.site.findUnique({
                where: { id: site.id },
                select: { bestScore: true, userId: true, isClient: true },
              });
              const score = scoredSite?.bestScore ?? 0;
              const seedManagedSite = scoredSite?.userId === systemUser!.id && scoredSite?.isClient !== true;
              const shouldPublish = score >= this.publicSeedScoreThreshold;

              if (seedManagedSite) {
                await this.prisma.site.update({
                  where: { id: site.id },
                  data: { isPublic: shouldPublish },
                });
              }

              await this.prisma.seedSource.update({
                where: { id: seed.id },
                data: {
                  status: 'scanned',
                  siteId: site.id,
                  failReason: shouldPublish
                    ? null
                    : `Scanned but kept private: GEO score ${score}/100 is below public threshold ${this.publicSeedScoreThreshold}/100`,
                },
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
      this.statusCache = null;
    }
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

  async quarantineLowQualityPublicSeeds(): Promise<{ threshold: number; quarantined: number }> {
    this.statusCache = null;
    const result = await this.prisma.site.updateMany({
      where: {
        isPublic: true,
        isClient: false,
        bestScore: { lt: this.publicSeedScoreThreshold },
        user: { is: { email: 'system@geovault.local' } },
        seedSource: { is: { status: 'scanned' } },
      },
      data: { isPublic: false },
    });
    this.logger.log(
      `Quarantined ${result.count} low-quality public seed sites below ${this.publicSeedScoreThreshold}/100`,
    );
    return { threshold: this.publicSeedScoreThreshold, quarantined: result.count };
  }

  /** Retry all failed seeds */
  async retryFailed(): Promise<{ reset: number }> {
    this.statusCache = null;
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
