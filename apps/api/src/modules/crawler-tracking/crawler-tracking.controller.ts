import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CrawlerTrackingService } from './crawler-tracking.service';
import { ReportVisitDto } from './dto/report-visit.dto';
import { QueryVisitsDto } from './dto/query-visits.dto';

@ApiTags('Crawler Tracking')
@Controller()
export class CrawlerTrackingController {
  constructor(private readonly service: CrawlerTrackingService) {}

  @Public()
  @Post('crawler/report')
  @ApiOperation({ summary: 'Report a crawler visit (public, token-based auth)' })
  report(@Body() dto: ReportVisitDto) {
    return this.service.reportVisit(dto);
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
  @Post('sites/:siteId/crawler/token/regenerate')
  @ApiOperation({ summary: 'Regenerate crawler tracking token' })
  regenerateToken(@Param('siteId') siteId: string) {
    return this.service.regenerateToken(siteId);
  }
}
