import { Controller, Get, Post, Param, Body, Query, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { CrawlerTrackingService } from './crawler-tracking.service';
import { PerplexityPingService } from './perplexity-ping.service';
import { CrawlerBoostService } from './crawler-boost.service';
import { ReportVisitDto } from './dto/report-visit.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';
import { ReportPlatformVisitDto } from './dto/report-platform-visit.dto';

// Standard 43-byte 1×1 transparent GIF89a payload — same bytes used by every
// pixel-tracking system. Pre-allocated as a module constant so we don't
// rebuild it per request.
const TRANSPARENT_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

@ApiTags('Crawler Tracking')
@Controller()
export class CrawlerTrackingController {
  constructor(
    private readonly service: CrawlerTrackingService,
    private readonly perplexityPing: PerplexityPingService,
    private readonly crawlerBoost: CrawlerBoostService,
  ) {}

  @Post('admin/crawler/boost')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '手動觸發爬蟲冷啟動推送 — 掃描 isClient=true 且 14 天內 0 次真實爬蟲造訪的站,對該站 URL + Geovault directory + brand_showcase + per-brand feeds 執行 IndexNow + WebSub 推送。跟排程 cron 同邏輯,同步執行方便觀察結果。',
  })
  boostCrawlers() {
    return this.crawlerBoost.boostColdClients();
  }

  @Public()
  @Post('crawler/report')
  @ApiOperation({ summary: 'Report a crawler visit (public, token-based auth)' })
  report(@Body() dto: ReportVisitDto) {
    return this.service.reportVisit(dto);
  }

  /**
   * Server-side pixel tracker for HTML-only AI crawlers (most current GPTBot /
   * ClaudeBot / PerplexityBot don't run JS). Customer site embeds an <img>
   * tag pointing here; bot loads the image while parsing HTML, we extract its
   * UA + Referer server-side. Always returns 200 with the GIF so a malformed
   * token / non-bot UA never produces a broken image on the customer's page.
   */
  /**
   * Route uses `:filename` (not `:token.gif`) because Express's path-to-regexp
   * v0.1 matches `:param.literal` inconsistently across NestJS versions —
   * sometimes `.gif` was being captured into the param, breaking token lookup.
   * Strip the extension in the handler instead. Accepts both `/pixel/abc` and
   * `/pixel/abc.gif`; customer sites use `.gif` so primitive image fetchers
   * still recognise the resource as an image.
   */
  @Public()
  @Get('crawler/pixel/:filename')
  @ApiOperation({ summary: 'Server-side pixel tracker — returns 1×1 GIF, records bot UA' })
  async pixel(
    @Param('filename') filename: string,
    @Query('u') urlQuery: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const token = (filename || '').replace(/\.gif$/i, '');
    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const referer = (req.headers['referer'] as string | undefined) || '';
    const url = urlQuery || referer;

    // Fire-and-forget. Image must respond fast; never block on DB.
    this.service
      .reportPixelVisit({ token, url, userAgent: ua })
      .catch(() => {});

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // CORP same-origin (set by Helmet globally) blocks cross-origin <img>
    // rendering in browsers, but the request still hits this handler so
    // tracking works. Override CORP to cross-origin so the pixel actually
    // displays in browsers too — keeps customer page consoles clean.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(TRANSPARENT_GIF);
  }

  @Public()
  @Post('crawler/report-platform')
  @ApiOperation({ summary: 'Report AI crawler visit to Geovault platform (from middleware)' })
  reportPlatform(@Body() body: ReportPlatformVisitDto) {
    return this.service.reportPlatformVisit(body);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler')
  @ApiOperation({ summary: 'Get crawler dashboard data' })
  dashboard(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getDashboard(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler/stats')
  @ApiOperation({ summary: 'Get 30-day daily crawler stats' })
  stats(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getStats(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler/robots')
  @ApiOperation({ summary: 'Get robots.txt analysis' })
  robots(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getRobots(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Get('crawler/snippet/:siteId')
  @ApiOperation({ summary: 'Get JS tracking snippet for a site' })
  snippet(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getSnippet(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/crawler/verify')
  @ApiOperation({ summary: 'Verify tracking snippet installation on user site' })
  verifyInstallation(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.verifyInstallation(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/crawler/token/regenerate')
  @ApiOperation({ summary: 'Regenerate crawler tracking token' })
  regenerateToken(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.regenerateToken(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Post('admin/crawler/perplexity-ping')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Manually trigger a Perplexity search ping' })
  perplexityPingManual(@Body('query') query?: string) {
    return this.perplexityPing.manualPing(query);
  }
}
