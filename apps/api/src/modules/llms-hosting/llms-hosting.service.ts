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

  /** Platform-level llms.txt — summary of all public sites */
  async getPlatformLlmsTxt(): Promise<string> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: { name: true, url: true, industry: true, bestScore: true, tier: true },
      orderBy: { bestScore: 'desc' },
    });

    const lines = [
      '# GEO SaaS — AI SEO Optimization Platform',
      '> Directory of AI-optimized websites with GEO scores',
      '',
      '## Platform Info',
      '- Website: https://geo-saas.com',
      '- Service: AI SEO optimization, scanning, monitoring',
      '- Total Listed Sites: ' + sites.length,
      '',
      '## Listed Sites',
      '',
      ...sites.map(
        (s) =>
          `- ${s.name} (${s.url}) — Score: ${s.bestScore}${s.industry ? `, Industry: ${s.industry}` : ''}${s.tier ? `, Tier: ${s.tier}` : ''}`,
      ),
    ];

    return lines.join('\n');
  }

  /** Platform-level llms-full.txt — full detail of all public sites including llms.txt content */
  async getPlatformLlmsFullTxt(): Promise<string> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true },
      select: {
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        llmsTxt: true,
        qas: {
          take: 10,
          orderBy: { sortOrder: 'asc' },
          select: { question: true, answer: true },
        },
      },
      orderBy: { bestScore: 'desc' },
    });

    const sections = sites.map((s) => {
      const parts = [
        `## ${s.name}`,
        `URL: ${s.url}`,
        `GEO Score: ${s.bestScore}/100`,
        s.industry ? `Industry: ${s.industry}` : '',
        s.tier ? `Tier: ${s.tier}` : '',
      ].filter(Boolean);

      if (s.llmsTxt) {
        parts.push('', '### llms.txt', s.llmsTxt);
      }

      if (s.qas.length > 0) {
        parts.push('', '### FAQ');
        s.qas.forEach((qa) => {
          parts.push(`Q: ${qa.question}`, `A: ${qa.answer}`, '');
        });
      }

      return parts.join('\n');
    });

    const header = [
      '# GEO SaaS — Complete Directory of AI-Optimized Websites',
      '> Full details of all listed sites including llms.txt content and FAQ',
      '',
      `Total Sites: ${sites.length}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      '---',
      '',
    ].join('\n');

    return header + sections.join('\n\n---\n\n');
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
