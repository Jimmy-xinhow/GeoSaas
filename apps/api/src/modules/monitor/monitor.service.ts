import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatgptDetector } from './platforms/chatgpt.detector';
import { ClaudeDetector } from './platforms/claude.detector';
import { PerplexityDetector } from './platforms/perplexity.detector';
import { GeminiDetector } from './platforms/gemini.detector';

@Injectable()
export class MonitorService {
  constructor(
    private prisma: PrismaService,
    private chatgptDetector: ChatgptDetector,
    private claudeDetector: ClaudeDetector,
    private perplexityDetector: PerplexityDetector,
    private geminiDetector: GeminiDetector,
  ) {}

  async findBySite(siteId: string) {
    return this.prisma.monitor.findMany({ where: { siteId }, orderBy: { checkedAt: 'desc' } });
  }

  async create(data: { siteId: string; platform: string; query: string }) {
    return this.prisma.monitor.create({ data: { ...data, checkedAt: new Date() } });
  }

  async checkCitation(id: string) {
    const monitor = await this.prisma.monitor.findUnique({ where: { id }, include: { site: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    let result: { mentioned: boolean; position: number | null; response: string };
    switch (monitor.platform) {
      case 'CHATGPT':
        result = await this.chatgptDetector.detect(monitor.query, monitor.site.name, monitor.site.url);
        break;
      case 'PERPLEXITY':
        result = await this.perplexityDetector.detect(monitor.query, monitor.site.name, monitor.site.url);
        break;
      case 'GEMINI':
        result = await this.geminiDetector.detect(monitor.query, monitor.site.name, monitor.site.url);
        break;
      case 'CLAUDE':
      default:
        result = await this.claudeDetector.detect(monitor.query, monitor.site.name, monitor.site.url);
        break;
    }

    return this.prisma.monitor.update({
      where: { id },
      data: { mentioned: result.mentioned, position: result.position, response: result.response, checkedAt: new Date() },
    });
  }

  async getDashboard(userId: string) {
    const sites = await this.prisma.site.findMany({ where: { userId }, select: { id: true } });
    const siteIds = sites.map((s) => s.id);
    const monitors = await this.prisma.monitor.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { checkedAt: 'desc' },
    });

    const platforms = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI'];
    const summary = platforms.map((p) => {
      const pMonitors = monitors.filter((m) => m.platform === p);
      const mentioned = pMonitors.filter((m) => m.mentioned).length;
      return { platform: p, total: pMonitors.length, mentioned, rate: pMonitors.length ? Math.round((mentioned / pMonitors.length) * 100) : 0 };
    });

    return { summary, recentChecks: monitors.slice(0, 20) };
  }

  async remove(id: string) {
    return this.prisma.monitor.delete({ where: { id } });
  }
}
