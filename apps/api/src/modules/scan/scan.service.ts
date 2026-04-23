import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService, PLAN_LIMITS } from '../../common/guards/plan.guard';
import { ScanPipelineService } from './scan-pipeline.service';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ScanPipelineService,
    private readonly planUsage: PlanUsageService,
    @Optional() @InjectQueue('scan') private readonly scanQueue?: Queue,
  ) {}

  async triggerScan(siteId: string, userId: string) {
    // Verify the site belongs to the user
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, userId },
    });
    if (!site) throw new NotFoundException('Site not found');

    // Check plan limit: scans per site per month
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      const plan = (user.plan || 'FREE') as keyof typeof PLAN_LIMITS;
      const limits = PLAN_LIMITS[plan];
      if (limits) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const scansThisMonth = await this.prisma.scan.count({
          where: { siteId, createdAt: { gte: monthStart } },
        });
        if (scansThisMonth >= limits.scansPerSitePerMonth) {
          throw new ForbiddenException(
            `此網站本月掃描次數已達上限（${scansThisMonth}/${limits.scansPerSitePerMonth}）。請升級方案以繼續使用。`,
          );
        }
      }
    }

    // Create the scan record with PENDING status
    const scan = await this.prisma.scan.create({
      data: { siteId, status: 'PENDING' },
    });

    // Run scan pipeline directly (fire-and-forget so POST returns immediately)
    this.logger.log(`Running scan ${scan.id} for ${site.url}`);
    this.pipeline.executeScan(scan.id, site.url).catch((error) => {
      this.logger.error(
        `Scan ${scan.id} failed: ${error instanceof Error ? error.stack : error}`,
      );
    });

    return scan;
  }

  async getScanHistory(siteId: string, userId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, userId },
    });
    if (!site) throw new NotFoundException('Site not found');

    return this.prisma.scan.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { results: true },
    });
  }

  async getScanById(scanId: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { results: true, site: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }

  /** Get aggregated score trend across all user's sites (last 30 scans) */
  async getScoreTrend(userId: string) {
    const scans = await this.prisma.scan.findMany({
      where: {
        status: 'COMPLETED',
        site: { userId },
      },
      orderBy: { completedAt: 'asc' },
      take: 30,
      select: {
        totalScore: true,
        completedAt: true,
        site: { select: { name: true } },
      },
    });

    return scans.map((s: any) => ({
      date: s.completedAt,
      score: s.totalScore,
      site: s.site.name,
    }));
  }

  async getScanResults(scanId: string) {
    return this.prisma.scanResult.findMany({
      where: { scanId },
      orderBy: { score: 'asc' },
    });
  }

  /**
   * Weekly scan refresh — keeps the Scan / ScanResult / bestScore tables
   * fresh so the GEO Comprehensive report shows up-to-date data. Without
   * this, client sites' scores stay frozen at first-scan time forever
   * because rescans only happen when a user clicks the button.
   *
   * Fires Sunday 02:00. Picks ~50 sites per run:
   *   - isClient=true (paid clients, always)
   *   - OR isPublic=true with bestScore>0 whose latest scan is >14 days old
   * Ordered by oldest last-scan first so the staleness gap stays bounded.
   *
   * No LLM cost — scan only fetches the site's public HTML and runs the
   * 9-indicator analyzer. Per-scan wall time ~10s; pLimit(3) keeps the
   * total run to a few minutes at 50 sites.
   */
  @Cron('0 2 * * 0', { name: 'scan-weekly-refresh' })
  async scheduledWeeklyRefresh(): Promise<void> {
    await this.runWeeklyRefresh(50);
  }

  /** Exposed for manual admin triggers (POST /admin/scan/weekly-refresh). */
  async runWeeklyRefresh(limit: number): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
  }> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    // Candidates: clients, or scored public sites whose last scan is stale.
    // Ordered by the "oldest scan wins" rule via a left-join; simpler to do
    // by loading candidate sites + their latest scan's completedAt and
    // sorting in Node.
    const sites = await this.prisma.site.findMany({
      where: {
        OR: [
          { isClient: true },
          {
            isPublic: true,
            bestScore: { gt: 0 },
            scans: {
              some: { status: 'COMPLETED', completedAt: { lt: fourteenDaysAgo } },
            },
          },
        ],
      },
      select: {
        id: true,
        url: true,
        name: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
    });

    // Oldest-scanned first (null = never scanned = infinitely old)
    const ordered = sites.sort((a, b) => {
      const aT = a.scans[0]?.completedAt?.getTime() ?? 0;
      const bT = b.scans[0]?.completedAt?.getTime() ?? 0;
      return aT - bT;
    });
    const batch = ordered.slice(0, limit);

    if (batch.length === 0) {
      this.logger.log('weekly-refresh: no stale sites');
      return { attempted: 0, succeeded: 0, failed: 0 };
    }

    this.logger.log(`weekly-refresh start: ${batch.length} sites`);

    const queue = pLimit(3);
    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      batch.map((site) =>
        queue(async () => {
          try {
            const scan = await this.prisma.scan.create({
              data: { siteId: site.id, status: 'PENDING' },
            });
            await this.pipeline.executeScan(scan.id, site.url);
            succeeded++;
          } catch (err) {
            failed++;
            this.logger.warn(
              `weekly-refresh failed for ${site.name}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }),
      ),
    );

    this.logger.log(`weekly-refresh done: ${succeeded} ok, ${failed} failed`);
    return { attempted: batch.length, succeeded, failed };
  }
}
