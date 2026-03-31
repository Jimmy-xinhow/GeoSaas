import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { IndustryAiService } from './industry-ai.service';

@ApiTags('Industry AI')
@Controller('industry-ai')
export class IndustryAiController {
  constructor(private readonly service: IndustryAiService) {}

  // ─── Public endpoints ───

  @Public()
  @Get(':industry/ranking')
  @ApiOperation({ summary: 'Get industry AI citation ranking' })
  getRanking(
    @Param('industry') industry: string,
    @Query('platform') platform?: string,
  ) {
    return this.service.getIndustryRanking(industry, platform);
  }

  @Public()
  @Get(':industry/sites')
  @ApiOperation({ summary: 'List sites in industry with AI data' })
  getSites(@Param('industry') industry: string) {
    return this.service.getIndustrySites(industry);
  }

  @Public()
  @Get('site/:siteId/impression')
  @ApiOperation({ summary: 'Get AI brand impression page data' })
  getImpression(@Param('siteId') siteId: string) {
    return this.service.getImpressionPage(siteId);
  }

  @Public()
  @Get('site/:siteId/trend')
  @ApiOperation({ summary: 'Get AI citation trend over time' })
  getTrend(
    @Param('siteId') siteId: string,
    @Query('weeks') weeks?: string,
  ) {
    return this.service.getCitationTrend(siteId, weeks ? parseInt(weeks, 10) : 12);
  }

  @Public()
  @Get(':industry/compare')
  @ApiOperation({ summary: 'Get brand comparison results' })
  getComparison(
    @Param('industry') industry: string,
    @Query('a') siteAId: string,
    @Query('b') siteBId: string,
  ) {
    return this.service.getComparison(siteAId, siteBId);
  }

  @Public()
  @Post(':industry/compare')
  @ApiOperation({ summary: 'Run a fresh brand comparison' })
  runComparison(
    @Body() body: { siteAId: string; siteBId: string },
  ) {
    return this.service.runComparison(body.siteAId, body.siteBId);
  }

  // ─── Admin endpoints ───

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':industry/run')
  @ApiOperation({ summary: 'Trigger full industry AI test (admin)' })
  runTest(@Param('industry') industry: string) {
    return this.service.runIndustryTest(industry);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('queries')
  @ApiOperation({ summary: 'Seed industry queries (admin)' })
  seedQueries(@Body() body: { industry: string; queries: { question: string; category: string }[] }) {
    return this.service.seedQueries(body.industry, body.queries);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get(':industry/queries')
  @ApiOperation({ summary: 'List industry queries (admin)' })
  getQueries(@Param('industry') industry: string) {
    return this.service.getQueries(industry);
  }
}
