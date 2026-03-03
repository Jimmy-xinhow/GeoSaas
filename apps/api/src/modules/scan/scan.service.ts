import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from './scan-pipeline.service';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ScanPipelineService,
    @Optional() @InjectQueue('scan') private readonly scanQueue?: Queue,
  ) {}

  async triggerScan(siteId: string, userId: string) {
    // Verify the site belongs to the user
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, userId },
    });
    if (!site) throw new NotFoundException('Site not found');

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

  async getScanResults(scanId: string) {
    return this.prisma.scanResult.findMany({
      where: { scanId },
      orderBy: { score: 'asc' },
    });
  }
}
