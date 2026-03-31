import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
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
}
