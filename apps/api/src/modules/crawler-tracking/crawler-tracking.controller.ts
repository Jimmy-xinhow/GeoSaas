import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { CrawlerTrackingService } from './crawler-tracking.service';
import { PerplexityPingService } from './perplexity-ping.service';
import { CrawlerBoostService } from './crawler-boost.service';
import { ReportVisitDto } from './dto/report-visit.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';

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

  @Public()
  @Post('crawler/report-platform')
  @ApiOperation({ summary: 'Report AI crawler visit to Geovault platform (from middleware)' })
  reportPlatform(@Body() body: { botName: string; url: string; userAgent: string; statusCode: number; source?: string }) {
    return this.service.reportPlatformVisit(body);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler')
  @ApiOperation({ summary: 'Get crawler dashboard data' })
  dashboard(@Param('siteId') siteId: string) {
    return this.service.getDashboard(siteId);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler/stats')
  @ApiOperation({ summary: 'Get 30-day daily crawler stats' })
  stats(@Param('siteId') siteId: string) {
    return this.service.getStats(siteId);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/crawler/robots')
  @ApiOperation({ summary: 'Get robots.txt analysis' })
  robots(@Param('siteId') siteId: string) {
    return this.service.getRobots(siteId);
  }

  @ApiBearerAuth()
  @Get('crawler/snippet/:siteId')
  @ApiOperation({ summary: 'Get JS tracking snippet for a site' })
  snippet(@Param('siteId') siteId: string) {
    return this.service.getSnippet(siteId);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/crawler/verify')
  @ApiOperation({ summary: 'Verify tracking snippet installation on user site' })
  verifyInstallation(@Param('siteId') siteId: string) {
    return this.service.verifyInstallation(siteId);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/crawler/token/regenerate')
  @ApiOperation({ summary: 'Regenerate crawler tracking token' })
  regenerateToken(@Param('siteId') siteId: string) {
    return this.service.regenerateToken(siteId);
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
