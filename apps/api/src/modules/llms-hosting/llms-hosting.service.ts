import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FixService } from '../fix/fix.service';

@Injectable()
export class LlmsHostingService {
  private readonly logger = new Logger(LlmsHostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fixService: FixService,
  ) {}

  async getLlmsTxt(siteId: string): Promise<string | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { llmsTxt: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site.llmsTxt;
  }

  async updateLlmsTxt(siteId: string, content: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        llmsTxt: content,
        llmsTxtUpdatedAt: new Date(),
      },
      select: { id: true, llmsTxt: true, llmsTxtUpdatedAt: true },
    });

    return updated;
  }

  async generateLlmsTxt(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, profile: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    // Find the latest completed scan with llms_txt result
    const latestScan = await this.prisma.scan.findFirst({
      where: { siteId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    let scanResultId: string | undefined;
    if (latestScan) {
      const llmsTxtResult = await this.prisma.scanResult.findFirst({
        where: { scanId: latestScan.id, indicator: 'llms_txt' },
        select: { id: true },
      });
      scanResultId = llmsTxtResult?.id;
    }

    // Use smart generate if we have a scan result, otherwise use template
    if (scanResultId) {
      const result = await this.fixService.smartGenerate(siteId, 'llms_txt', scanResultId);
      // Auto-save to site
      await this.prisma.site.update({
        where: { id: siteId },
        data: { llmsTxt: result.code, llmsTxtUpdatedAt: new Date() },
      });
      return { content: result.code };
    }

    // Template fallback
    const content = `# ${site.name}\n\n> ${site.name} 的官方網站\n\nWebsite: ${site.url}`;
    await this.prisma.site.update({
      where: { id: siteId },
      data: { llmsTxt: content, llmsTxtUpdatedAt: new Date() },
    });
    return { content };
  }
}
