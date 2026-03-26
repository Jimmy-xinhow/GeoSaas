import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import * as crypto from 'crypto';

const GUEST_DAILY_LIMIT = 3;

@Injectable()
export class GuestScanService {
  private readonly logger = new Logger(GuestScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ScanPipelineService,
  ) {}

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  async createScan(url: string, ip: string) {
    const ipHash = this.hashIp(ip);

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = await this.prisma.guestScan.count({
      where: {
        ipHash,
        createdAt: { gte: todayStart },
      },
    });

    if (todayCount >= GUEST_DAILY_LIMIT) {
      throw new BadRequestException(
        `Daily limit reached (${GUEST_DAILY_LIMIT} scans). Sign up for unlimited scans!`,
      );
    }

    // Create guest scan record
    const guestScan = await this.prisma.guestScan.create({
      data: { url, ipHash, status: 'PENDING' },
    });

    // Run scan pipeline (fire-and-forget)
    this.runGuestScan(guestScan.id, url).catch((error) => {
      this.logger.error(
        `Guest scan ${guestScan.id} failed: ${error instanceof Error ? error.stack : error}`,
      );
    });

    return {
      id: guestScan.id,
      url: guestScan.url,
      status: guestScan.status,
      remaining: GUEST_DAILY_LIMIT - todayCount - 1,
    };
  }

  private async runGuestScan(scanId: string, url: string) {
    await this.prisma.guestScan.update({
      where: { id: scanId },
      data: { status: 'RUNNING' },
    });

    try {
      const results = await this.pipeline.executeGuestScan(url);

      await this.prisma.guestScan.update({
        where: { id: scanId },
        data: {
          status: 'COMPLETED',
          totalScore: results.totalScore,
          results: results as any,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.guestScan.update({
        where: { id: scanId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  async getStatus(id: string) {
    const scan = await this.prisma.guestScan.findUnique({
      where: { id },
    });
    if (!scan) {
      throw new BadRequestException('Scan not found');
    }
    return scan;
  }
}
