import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron } from '@nestjs/schedule';
import pLimit from '@/common/utils/p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService, PLAN_LIMITS } from '../../common/guards/plan.guard';
import { assertSiteAccess, canAccessSite, workspaceSiteWhere } from '../../common/auth/site-access';
import { ScanPipelineService } from './scan-pipeline.service';
import { isScanRetryBackoffActive } from './scan-retry-policy';

const STALE_SCAN_EXECUTION_MS = 10 * 60 * 1000;
const INTERRUPTED_SCAN_REASON = 'Scan worker stopped before the scan completed';

@Injectable()
export class ScanService implements OnModuleInit {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ScanPipelineService,
    private readonly planUsage: PlanUsageService,
    @Optional() @InjectQueue('scan') private readonly scanQueue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const recovered = await this.recoverInterruptedScans();
    if (recovered > 0) {
      this.logger.warn(`Recovered ${recovered} interrupted scan execution(s) on startup`);
    }
  }

  /**
   * A normal crawl is bounded to seconds. PENDING/RUNNING for ten minutes can
   * only be an interrupted worker/process lifecycle, not a slow target. Close
   * those durable rows with an explicit reason so dashboards do not wait
   * forever and a later retry starts from a clean state.
   */
  @Cron('15 * * * *', { name: 'scan-interrupted-recovery' })
  async recoverInterruptedScans(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_SCAN_EXECUTION_MS);
    const result = await this.prisma.scan.updateMany({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        failureCode: 'interrupted',
        failureReason: INTERRUPTED_SCAN_REASON,
        completedAt: now,
      },
    });
    return result.count;
  }

  async triggerScan(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    // Check plan limit: scans per site per month
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      const plan = await this.planUsage.getEffectivePlan(userId, user.plan);
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

  async getScanHistory(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);

    return this.prisma.scan.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { results: true },
    });
  }

  async getScanById(scanId: string, userId: string, role?: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { results: true, site: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    if (!canAccessSite(scan.site, userId, role)) {
      throw new NotFoundException('Scan not found');
    }
    return scan;
  }

  /** Get aggregated score trend across all user's sites (last 30 scans) */
  async getScoreTrend(userId: string, role?: string) {
    const scans = await this.prisma.scan.findMany({
      where: {
        status: 'COMPLETED',
        site: workspaceSiteWhere(userId, role),
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

  async getScanResults(scanId: string, userId: string, role?: string) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      select: { site: { select: { userId: true, isClient: true } } },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    if (!canAccessSite(scan.site, userId, role)) {
      throw new NotFoundException('Scan not found');
    }

    return this.prisma.scanResult.findMany({
      where: { scanId },
      orderBy: { score: 'asc' },
    });
  }

  /**
   * Admin escape hatch: force a fresh scan for a specific site, bypassing
   * the ownership + monthly-quota checks that triggerScan() enforces.
   * Used from the GEO Comprehensive report flow when an admin needs
   * up-to-date scan data immediately (cron is weekly).
   *
   * Awaits pipeline completion so the caller knows when Scan/ScanResult
   * rows are ready — no fire-and-forget here; callers typically want to
   * read the updated comprehensive report right after.
   */
  async adminForceScan(siteId: string): Promise<{ scanId: string; totalScore: number }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const scan = await this.prisma.scan.create({
      data: { siteId, status: 'PENDING' },
    });
    this.logger.log(`admin force-scan ${site.name} → scan ${scan.id}`);
    await this.pipeline.executeScan(scan.id, site.url);
    const finished = await this.prisma.scan.findUnique({
      where: { id: scan.id },
      select: { id: true, totalScore: true },
    });
    return { scanId: finished?.id ?? scan.id, totalScore: finished?.totalScore ?? 0 };
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
    skippedBackoff: number;
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
            NOT: {
              scans: {
                some: { status: 'COMPLETED', completedAt: { gte: fourteenDaysAgo } },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        url: true,
        name: true,
        isClient: true,
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { status: true, createdAt: true, completedAt: true },
        },
      },
    });

    const now = new Date();
    const skippedBackoff = sites.filter((site) =>
      isScanRetryBackoffActive(site.scans, now),
    ).length;
    const eligible = sites.filter((site) => {
      if (isScanRetryBackoffActive(site.scans, now)) return false;
      if (site.isClient) return true;
      // The query requires at least one old completed scan and excludes any
      // completed scan inside the freshness window. This remains true even
      // when the last five executions are all failures.
      if (!site.scans.some((scan) => scan.status === 'COMPLETED')) return true;
      const latestCompleted = site.scans.find((scan) => scan.status === 'COMPLETED')?.completedAt;
      return Boolean(latestCompleted && latestCompleted < fourteenDaysAgo);
    });

    // Paid clients are always serviced before the larger directory backlog;
    // within each tier, oldest-scanned wins. Otherwise thousands of stale
    // public seeds can permanently starve the client sites.
    const ordered = eligible.sort((a, b) => {
      const clientPriority = Number(b.isClient) - Number(a.isClient);
      if (clientPriority !== 0) return clientPriority;
      const aT = a.scans.find((scan) => scan.status === 'COMPLETED')?.completedAt?.getTime() ?? 0;
      const bT = b.scans.find((scan) => scan.status === 'COMPLETED')?.completedAt?.getTime() ?? 0;
      return aT - bT;
    });
    const batch = ordered.slice(0, limit);

    if (batch.length === 0) {
      this.logger.log(`weekly-refresh: no eligible stale sites (${skippedBackoff} in retry backoff)`);
      return { attempted: 0, succeeded: 0, failed: 0, skippedBackoff };
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

    this.logger.log(
      `weekly-refresh done: ${succeeded} ok, ${failed} failed, ${skippedBackoff} in retry backoff`,
    );
    return { attempted: batch.length, succeeded, failed, skippedBackoff };
  }
}
