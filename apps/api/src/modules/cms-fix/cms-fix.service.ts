import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSiteAccess } from '../../common/auth/site-access';
import { FixService } from '../fix/fix.service';
import { ConnectWordPressDto, PluginActionResultDto, PluginPingDto } from './dto/cms-fix.dto';

const WORDPRESS_PROVIDER = 'wordpress';
const FIXABLE_INDICATORS = new Set([
  'json_ld',
  'llms_txt',
  'og_tags',
  'faq_schema',
  'meta_description',
]);

type SiteForPlan = {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  isPublic: boolean;
  bestScore: number;
  tier: string | null;
  profile: unknown;
  llmsTxt: string | null;
  crawlerToken: string | null;
  qas: Array<{ question: string; answer: string }>;
};

@Injectable()
export class CmsFixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fixService: FixService,
  ) {}

  async connectWordPress(
    siteId: string,
    userId: string,
    role: string | undefined,
    dto: ConnectWordPressDto,
    origin?: string,
  ) {
    const site = await assertSiteAccess(this.prisma, siteId, userId, role);
    const token = `gvfix_${randomBytes(32).toString('base64url')}`;
    const pluginTokenHash = this.hashToken(token);
    const tokenLast4 = token.slice(-4);

    const connection = await this.prisma.cmsConnection.upsert({
      where: {
        siteId_provider: {
          siteId,
          provider: WORDPRESS_PROVIDER,
        },
      },
      create: {
        siteId,
        userId: site.userId,
        provider: WORDPRESS_PROVIDER,
        status: 'pending',
        apiBaseUrl: dto.apiBaseUrl,
        pluginTokenHash,
        tokenLast4,
      },
      update: {
        status: 'pending',
        apiBaseUrl: dto.apiBaseUrl,
        pluginTokenHash,
        tokenLast4,
        capabilities: [],
        lastSeenAt: null,
      },
    });

    return {
      connection: this.serializeConnection(connection),
      install: {
        siteId,
        apiUrl: this.apiPublicUrl(origin),
        token,
      },
    };
  }

  async getStatus(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);

    const [connection, latestRun] = await Promise.all([
      this.prisma.cmsConnection.findUnique({
        where: { siteId_provider: { siteId, provider: WORDPRESS_PROVIDER } },
      }),
      this.prisma.siteFixRun.findFirst({
        where: { siteId },
        orderBy: { createdAt: 'desc' },
        include: { actions: { orderBy: { createdAt: 'asc' } } },
      }),
    ]);

    return {
      connection: connection ? this.serializeConnection(connection) : null,
      latestRun,
    };
  }

  async createPlan(siteId: string, userId: string, role?: string, origin?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);

    const [site, connection, latestScan] = await Promise.all([
      this.prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          name: true,
          url: true,
          industry: true,
          isPublic: true,
          bestScore: true,
          tier: true,
          profile: true,
          llmsTxt: true,
          crawlerToken: true,
          qas: {
            orderBy: { sortOrder: 'asc' },
            take: 8,
            select: { question: true, answer: true },
          },
        },
      }),
      this.prisma.cmsConnection.findUnique({
        where: { siteId_provider: { siteId, provider: WORDPRESS_PROVIDER } },
      }),
      this.prisma.scan.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        include: { results: true },
      }),
    ]);

    if (!site) throw new NotFoundException('Site not found');
    if (!latestScan) {
      throw new BadRequestException('Run a completed scan before creating a CMS repair plan.');
    }

    const actionInputs = latestScan.results
      .filter((result: any) => FIXABLE_INDICATORS.has(result.indicator))
      .filter((result: any) => result.status !== 'pass' || result.score < 90)
      .map((result: any) => this.buildActionFromScanResult(site, result))
      .filter(Boolean) as Array<{
        scanResultId?: string;
        type: string;
        title: string;
        payload: Record<string, unknown>;
        generatedCode?: string;
      }>;

    const extraActions = await this.buildAlwaysOnActions(site, origin);
    const actions = [...actionInputs, ...extraActions];
    if (actions.length === 0) {
      throw new BadRequestException('No CMS-fixable issues were found in the latest scan.');
    }

    const run = await this.prisma.siteFixRun.create({
      data: {
        siteId,
        connectionId: connection?.id,
        requestedById: userId,
        status: 'planned',
        summary: {
          scanId: latestScan.id,
          totalActions: actions.length,
          generatedAt: new Date().toISOString(),
        },
        actions: {
          create: actions.map((action) => ({
            siteId,
            scanResultId: action.scanResultId,
            type: action.type,
            title: action.title,
            payload: action.payload as any,
            generatedCode: action.generatedCode,
          })),
        },
      },
      include: { actions: { orderBy: { createdAt: 'asc' } } },
    });

    return run;
  }

  async dispatchRun(siteId: string, runId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const run = await this.prisma.siteFixRun.findFirst({
      where: { id: runId, siteId },
      include: { connection: true },
    });
    if (!run) throw new NotFoundException('Fix run not found');
    if (!run.connection) {
      throw new BadRequestException('Connect the WordPress plugin before dispatching this fix run.');
    }
    if (run.connection.status !== 'connected') {
      throw new BadRequestException('WordPress plugin has not connected yet. Save the settings in WordPress and sync once before dispatching.');
    }

    await this.prisma.$transaction([
      this.prisma.siteFixRun.update({
        where: { id: runId },
        data: { status: 'dispatched', executedAt: new Date() },
      }),
      this.prisma.siteFixAction.updateMany({
        where: { runId, status: 'pending' },
        data: { status: 'dispatched' },
      }),
    ]);

    return this.getStatus(siteId, userId, role);
  }

  async pluginPing(siteId: string, token: string | undefined, dto: PluginPingDto) {
    const connection = await this.assertPluginConnection(siteId, token);
    const updated = await this.prisma.cmsConnection.update({
      where: { id: connection.id },
      data: {
        status: 'connected',
        capabilities: dto.capabilities ?? connection.capabilities,
        lastSeenAt: new Date(),
      },
    });
    return { ok: true, connection: this.serializeConnection(updated) };
  }

  async getPluginManifest(siteId: string, token: string | undefined) {
    const connection = await this.assertPluginConnection(siteId, token);
    await this.prisma.cmsConnection.update({
      where: { id: connection.id },
      data: { status: 'connected', lastSeenAt: new Date() },
    });

    const run = await this.prisma.siteFixRun.findFirst({
      where: {
        siteId,
        connectionId: connection.id,
        status: { in: ['dispatched', 'partially_applied'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { id: true, name: true, url: true } },
        actions: {
          where: { status: 'dispatched' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!run) {
      return { ok: true, siteId, run: null, actions: [] };
    }

    await this.prisma.siteFixAction.updateMany({
      where: { runId: run.id, status: 'pending' },
      data: { status: 'dispatched' },
    });

    return {
      ok: true,
      siteId,
      run: {
        id: run.id,
        status: run.status,
        createdAt: run.createdAt,
        site: run.site,
      },
      actions: run.actions.map((action: any) => ({
        id: action.id,
        type: action.type,
        title: action.title,
        payload: action.payload,
        updatedAt: action.updatedAt,
      })),
    };
  }

  async reportActionResult(
    siteId: string,
    actionId: string,
    token: string | undefined,
    dto: PluginActionResultDto,
  ) {
    const connection = await this.assertPluginConnection(siteId, token);
    const action = await this.prisma.siteFixAction.findFirst({
      where: { id: actionId, siteId, run: { connectionId: connection.id } },
      select: { id: true, runId: true },
    });
    if (!action) throw new NotFoundException('Fix action not found');

    await this.prisma.siteFixAction.update({
      where: { id: actionId },
      data: {
        status: dto.status,
        pluginAppliedAt: dto.status === 'applied' ? new Date() : null,
        error: dto.status === 'failed' ? dto.message ?? 'Plugin reported failure' : null,
      },
    });
    await this.prisma.cmsConnection.update({
      where: { id: connection.id },
      data: { status: 'connected', lastSeenAt: new Date() },
    });
    await this.refreshRunStatus(action.runId);

    return { ok: true };
  }

  private buildActionFromScanResult(site: SiteForPlan, result: any) {
    const description = this.siteDescription(site);

    if (result.generatedCode) {
      return this.wrapGeneratedScanCode(site, result, result.generatedCode);
    }

    switch (result.indicator) {
      case 'json_ld': {
        const code = this.fixService.generateJsonLd({
          type: site.industry ? 'LocalBusiness' : 'Organization',
          name: site.name,
          url: site.url,
          description,
        }).code;
        return this.headAction(result, 'install_json_ld', '安裝 JSON-LD 結構化資料', code);
      }
      case 'llms_txt': {
        const code = this.fixService.generateLlmsTxt({
          title: site.name,
          description,
          url: site.url,
          links: [{ title: 'Geovault 品牌檔案', url: `${this.webUrl()}/directory/${site.id}` }],
        }).code;
        return {
          scanResultId: result.id,
          type: 'install_llms_txt',
          title: '建立 /llms.txt',
          generatedCode: code,
          payload: { path: 'llms.txt', content: code },
        };
      }
      case 'og_tags': {
        const code = this.fixService.generateOgTags({
          title: site.name,
          description,
          url: site.url,
          type: 'website',
        }).code;
        return this.headAction(result, 'install_og_tags', '安裝 Open Graph 標籤', code);
      }
      case 'faq_schema': {
        const qas = site.qas.length > 0
          ? site.qas
          : [{ question: `${site.name} 是什麼？`, answer: description }];
        const code = this.fixService.generateFaqSchema(qas).code;
        return this.headAction(result, 'install_faq_schema', '安裝 FAQ Schema', code);
      }
      case 'meta_description': {
        const safe = this.escapeHtml(description.slice(0, 160));
        const code = `<meta name="description" content="${safe}">`;
        return this.headAction(result, 'install_meta_description', '補上 Meta Description', code, {
          description: safe,
        });
      }
      default:
        return null;
    }
  }

  private wrapGeneratedScanCode(site: SiteForPlan, result: any, code: string) {
    if (result.indicator === 'llms_txt') {
      return {
        scanResultId: result.id,
        type: 'install_llms_txt',
        title: '建立 /llms.txt',
        generatedCode: code,
        payload: { path: 'llms.txt', content: code },
      };
    }
    const typeMap: Record<string, string> = {
      json_ld: 'install_json_ld',
      og_tags: 'install_og_tags',
      faq_schema: 'install_faq_schema',
      meta_description: 'install_meta_description',
    };
    return this.headAction(
      result,
      typeMap[result.indicator] ?? `install_${result.indicator}`,
      `套用 ${result.indicator} 修復`,
      code,
      { siteName: site.name },
    );
  }

  private headAction(
    result: any,
    type: string,
    title: string,
    code: string,
    extraPayload: Record<string, unknown> = {},
  ) {
    return {
      scanResultId: result.id,
      type,
      title,
      generatedCode: code,
      payload: {
        placement: 'head',
        html: code,
        ...extraPayload,
      },
    };
  }

  private async buildAlwaysOnActions(site: SiteForPlan, origin?: string) {
    const actions: Array<{
      scanResultId?: string;
      type: string;
      title: string;
      payload: Record<string, unknown>;
      generatedCode?: string;
    }> = [];

    if (site.isPublic) {
      const score = site.bestScore ?? 0;
      const html = `<a href="${this.webUrl()}/directory/${site.id}" target="_blank" rel="noopener"><img src="${this.apiPublicUrl(origin)}/api/badge/${site.id}.svg" alt="GEO Score: ${score} | Verified by Geovault" width="148" height="20"></a>`;
      actions.push({
        type: 'install_geo_badge',
        title: '安裝 GEO Score Badge',
        generatedCode: html,
        payload: { placement: 'footer', html },
      });
    }

    const crawlerToken = site.crawlerToken || randomBytes(24).toString('hex');
    if (!site.crawlerToken) {
      await this.prisma.site.update({
        where: { id: site.id },
        data: { crawlerToken },
      });
    }
    const tracker = this.crawlerSnippet(crawlerToken, origin);
    actions.push({
      type: 'install_crawler_tracking',
      title: '安裝 AI 爬蟲追蹤片段',
      generatedCode: tracker,
      payload: { placement: 'footer', html: tracker },
    });

    return actions;
  }

  private async refreshRunStatus(runId: string) {
    const actions = await this.prisma.siteFixAction.findMany({
      where: { runId },
      select: { status: true },
    });
    const allAppliedOrSkipped = actions.every((a: any) => a.status === 'applied' || a.status === 'skipped');
    const anyApplied = actions.some((a: any) => a.status === 'applied');
    const anyFailed = actions.some((a: any) => a.status === 'failed');
    const status = allAppliedOrSkipped
      ? 'applied'
      : anyApplied || anyFailed
      ? 'partially_applied'
      : 'dispatched';
    await this.prisma.siteFixRun.update({ where: { id: runId }, data: { status } });
  }

  private async assertPluginConnection(siteId: string, token?: string) {
    if (!token) throw new ForbiddenException('Missing Geovault plugin token');
    const connection = await this.prisma.cmsConnection.findUnique({
      where: { siteId_provider: { siteId, provider: WORDPRESS_PROVIDER } },
    });
    if (!connection || connection.status === 'disabled') {
      throw new ForbiddenException('CMS connection is not active');
    }
    if (connection.pluginTokenHash !== this.hashToken(token)) {
      throw new ForbiddenException('Invalid Geovault plugin token');
    }
    return connection;
  }

  private serializeConnection(connection: any) {
    return {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      apiBaseUrl: connection.apiBaseUrl,
      tokenLast4: connection.tokenLast4,
      capabilities: connection.capabilities,
      lastSeenAt: connection.lastSeenAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private siteDescription(site: SiteForPlan): string {
    const profile = site.profile && typeof site.profile === 'object' && !Array.isArray(site.profile)
      ? site.profile as Record<string, unknown>
      : {};
    const value = profile.description ?? profile.summary ?? profile.positioning ?? profile.uniqueValue;
    const description = typeof value === 'string' ? value.trim() : '';
    return description || `${site.name} 是一個收錄於 Geovault 的品牌網站，主要網站為 ${site.url}。`;
  }

  private apiPublicUrl(origin?: string): string {
    if (origin) {
      try {
        const url = new URL(origin);
        const isLocal =
          url.protocol === 'http:' &&
          (url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname.startsWith('192.168.') ||
            url.hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname));
        if (isLocal) return `${url.protocol}//${url.hostname}:4000`;
      } catch {
        // Fall through to configured public API URL.
      }
    }
    return (process.env.API_PUBLIC_URL || 'https://api.geovault.app').replace(/\/$/, '');
  }

  private webUrl(): string {
    return (process.env.FRONTEND_URL || 'https://www.geovault.app').replace(/\/$/, '');
  }

  private crawlerSnippet(token: string, origin?: string): string {
    const apiUrl = this.apiPublicUrl(origin);
    return `<!-- Geovault AI Crawler Tracker -->
<script>
(function() {
  var AI_BOTS = ['ClaudeBot','GPTBot','ChatGPT-User','Google-Extended','PerplexityBot','YouBot','CCBot','Bytespider','bingbot','Googlebot'];
  var ua = navigator.userAgent || '';
  for (var i = 0; i < AI_BOTS.length; i++) {
    if (ua.indexOf(AI_BOTS[i]) !== -1) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '${apiUrl}/api/crawler/report', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ token: '${token}', botName: AI_BOTS[i], url: window.location.href, userAgent: ua }));
      break;
    }
  }
})();
</script>
<img src="${apiUrl}/api/crawler/pixel/${token}.gif" alt="" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px" referrerpolicy="no-referrer-when-downgrade" />`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
