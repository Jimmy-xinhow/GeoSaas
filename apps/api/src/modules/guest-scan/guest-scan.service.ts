import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import * as crypto from 'crypto';

const DEFAULT_GUEST_DAILY_LIMIT = 3;
const E2E_GUEST_DAILY_LIMIT = 1000;

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

  private getDailyLimit(): number {
    const configured = Number(process.env.GUEST_DAILY_LIMIT);
    if (Number.isInteger(configured) && configured > 0) return configured;
    if (process.env.E2E === '1') return E2E_GUEST_DAILY_LIMIT;
    return DEFAULT_GUEST_DAILY_LIMIT;
  }

  async createScan(url: string, ip: string) {
    const normalizedUrl = this.normalizePublicScanUrl(url);
    const ipHash = this.hashIp(ip);
    const dailyLimit = this.getDailyLimit();

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = await this.prisma.guestScan.count({
      where: {
        ipHash,
        createdAt: { gte: todayStart },
      },
    });

    if (todayCount >= dailyLimit) {
      throw new BadRequestException(
        `Daily limit reached (${dailyLimit} scans). Sign up for unlimited scans!`,
      );
    }

    // Create guest scan record
    const guestScan = await this.prisma.guestScan.create({
      data: { url: normalizedUrl, ipHash, status: 'PENDING' },
    });

    // Run scan pipeline (fire-and-forget)
    this.runGuestScan(guestScan.id, normalizedUrl).catch((error) => {
      this.logger.error(
        `Guest scan ${guestScan.id} failed: ${error instanceof Error ? error.stack : error}`,
      );
    });

    return {
      id: guestScan.id,
      url: guestScan.url,
      status: guestScan.status,
      remaining: dailyLimit - todayCount - 1,
    };
  }

  private normalizePublicScanUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTP(S) URLs can be scanned');
    }

    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      this.isPrivateOrReservedIp(hostname)
    ) {
      throw new BadRequestException('Private or local URLs cannot be scanned');
    }

    return parsed.toString();
  }

  private isPrivateOrReservedIp(hostname: string): boolean {
    const normalized = hostname.replace(/^\[|\]$/g, '');
    const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const parts = ipv4.slice(1).map(Number);
      if (parts.some((part) => part < 0 || part > 255)) return true;
      const [a, b] = parts;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }

    return (
      normalized === '::1' ||
      normalized === '0:0:0:0:0:0:0:1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
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
      select: {
        id: true,
        url: true,
        totalScore: true,
        status: true,
        results: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!scan) {
      throw new BadRequestException('Scan not found');
    }
    return scan;
  }
}
