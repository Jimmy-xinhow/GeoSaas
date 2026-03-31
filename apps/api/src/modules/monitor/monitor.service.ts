import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { ChatgptDetector } from './platforms/chatgpt.detector';
import { ClaudeDetector } from './platforms/claude.detector';
import { PerplexityDetector } from './platforms/perplexity.detector';
import { GeminiDetector } from './platforms/gemini.detector';
import { CopilotDetector } from './platforms/copilot.detector';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private prisma: PrismaService,
    private planUsage: PlanUsageService,
    private chatgptDetector: ChatgptDetector,
    private claudeDetector: ClaudeDetector,
    private perplexityDetector: PerplexityDetector,
    private geminiDetector: GeminiDetector,
    private copilotDetector: CopilotDetector,
  ) {}

  async findBySite(siteId: string) {
    return this.prisma.monitor.findMany({ where: { siteId }, orderBy: { checkedAt: 'desc' } });
  }

  async create(data: { siteId: string; platform: string; query: string }) {
    // Check plan limit: monitorPerMonth
    const site = await this.prisma.site.findUnique({ where: { id: data.siteId }, select: { userId: true } });
    if (site) {
      const user = await this.prisma.user.findUnique({ where: { id: site.userId } });
      if (user) {
        const check = await this.planUsage.checkAndIncrement(site.userId, 'monitorPerMonth', user.plan, user.role);
        if (!check.allowed) {
          throw new ForbiddenException(
            `已達本月監測額度上限（${check.used}/${check.limit}）。請升級方案以繼續使用。`,
          );
        }
      }
    }

    const monitor = await this.prisma.monitor.create({
      data: { ...data, platform: data.platform.toUpperCase(), checkedAt: new Date() },
    });

    // Auto-run first citation check in background (don't block the response)
    this.checkCitation(monitor.id).catch((err) => {
      this.logger.warn(`Auto-check failed for monitor ${monitor.id}: ${err.message}`);
    });

    return monitor;
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
      case 'COPILOT':
        result = await this.copilotDetector.detect(monitor.query, monitor.site.name, monitor.site.url);
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
    const siteIds = sites.map((s: any) => s.id);
    const monitors = await this.prisma.monitor.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { checkedAt: 'desc' },
    });

    const platformNames: Record<string, string> = {
      CHATGPT: 'ChatGPT', CLAUDE: 'Claude', PERPLEXITY: 'Perplexity', GEMINI: 'Gemini', COPILOT: 'Copilot',
    };
    const platformKeys = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];

    const platforms = platformKeys.map((p) => {
      const pMonitors = monitors.filter((m: any) => m.platform.toUpperCase() === p);
      const checked = pMonitors.filter((m: any) => m.response && !m.response.startsWith('[Error]'));
      const mentioned = checked.filter((m: any) => m.mentioned).length;
      const total = pMonitors.length;
      const errorCount = pMonitors.filter((m: any) => m.response?.startsWith('[Error]')).length;
      const rate = checked.length ? Math.round((mentioned / checked.length) * 100) : 0;
      return {
        name: platformNames[p] || p,
        rate,
        total,
        checked: checked.length,
        mentioned,
        errorCount,
        trend: 'stable' as const,
        trendValue: '--',
      };
    });

    const queries = monitors.slice(0, 50).map((m: any) => {
      const hasError = m.response?.startsWith('[Error]') || false;
      const notChecked = !m.response;
      return {
        id: m.id,
        query: m.query,
        platform: platformNames[m.platform.toUpperCase()] || m.platform,
        cited: m.mentioned,
        position: m.position,
        status: hasError ? 'error' as const : notChecked ? 'pending' as const : 'checked' as const,
        errorMessage: hasError ? m.response!.replace('[Error] ', '').substring(0, 100) : undefined,
        response: hasError || notChecked ? undefined : m.response,
        lastCheck: m.checkedAt?.toISOString() || null,
      };
    });

    return { platforms, queries };
  }

  async remove(id: string) {
    return this.prisma.monitor.delete({ where: { id } });
  }
}
