import { BadRequestException, Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { IndustryAiService } from './industry-ai.service';
import { RunIndustryComparisonDto, RunIndustryTestDto, SeedIndustryQueriesDto } from './dto/industry-ai.dto';

@ApiTags('Industry AI')
@Controller('industry-ai')
export class IndustryAiController {
  constructor(private readonly service: IndustryAiService) {}

  private readonly allowedPlatforms = new Set(['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT']);

  private normalizeIndustry(industry: string): string {
    const normalized = industry?.trim();
    if (!normalized) throw new BadRequestException('industry is required');
    if (normalized.length > 80) throw new BadRequestException('industry must be at most 80 characters');
    return normalized;
  }

  private normalizePlatform(platform?: string): string | undefined {
    if (!platform) return undefined;
    const normalized = platform.trim().toUpperCase();
    if (!this.allowedPlatforms.has(normalized)) {
      throw new BadRequestException('Invalid platform');
    }
    return normalized;
  }

  private parseWeeks(value: string | undefined): number {
    if (!value) return 12;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('weeks must be a positive integer');
    }
    const parsed = Number(value);
    if (parsed < 1) throw new BadRequestException('weeks must be at least 1');
    if (parsed > 52) throw new BadRequestException('weeks must be at most 52');
    return parsed;
  }

  private normalizeId(value: string | undefined, name: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${name} is required`);
    if (normalized.length > 128) throw new BadRequestException(`${name} must be at most 128 characters`);
    return normalized;
  }

  // ─── Public endpoints ───

  @Public()
  @Get(':industry/ranking')
  @ApiOperation({ summary: 'Get industry AI citation ranking' })
  getRanking(
    @Param('industry') industry: string,
    @Query('platform') platform?: string,
  ) {
    return this.service.getIndustryRanking(this.normalizeIndustry(industry), this.normalizePlatform(platform));
  }

  @Public()
  @Get(':industry/sites')
  @ApiOperation({ summary: 'List sites in industry with AI data' })
  getSites(@Param('industry') industry: string) {
    return this.service.getIndustrySites(this.normalizeIndustry(industry));
  }

  @Public()
  @Get('site/:siteId/impression')
  @ApiOperation({ summary: 'Get AI brand impression page data' })
  getImpression(@Param('siteId') siteId: string) {
    return this.service.getImpressionPage(this.normalizeId(siteId, 'siteId'));
  }

  @Public()
  @Get('site/:siteId/trend')
  @ApiOperation({ summary: 'Get AI citation trend over time' })
  getTrend(
    @Param('siteId') siteId: string,
    @Query('weeks') weeks?: string,
  ) {
    return this.service.getCitationTrend(this.normalizeId(siteId, 'siteId'), this.parseWeeks(weeks));
  }

  @Public()
  @Get(':industry/compare')
  @ApiOperation({ summary: 'Get brand comparison results' })
  getComparison(
    @Param('industry') industry: string,
    @Query('a') siteAId: string,
    @Query('b') siteBId: string,
  ) {
    this.normalizeIndustry(industry);
    return this.service.getComparison(
      this.normalizeId(siteAId, 'a'),
      this.normalizeId(siteBId, 'b'),
    );
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':industry/compare')
  @ApiOperation({ summary: 'Run a fresh brand comparison (admin)' })
  runComparison(
    @Body() body: RunIndustryComparisonDto,
  ) {
    return this.service.runComparison(
      this.normalizeId(body.siteAId, 'siteAId'),
      this.normalizeId(body.siteBId, 'siteBId'),
    );
  }

  // ─── Admin endpoints ───

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':industry/run')
  @ApiOperation({ summary: 'Trigger full industry AI test (admin, background)' })
  runTest(
    @Param('industry') industry: string,
    @Body() body?: RunIndustryTestDto,
  ) {
    const normalizedIndustry = this.normalizeIndustry(industry);
    const hasLimits = body && (
      body.fullRun === false ||
      body.maxSites ||
      body.maxQueries ||
      body.platforms?.length ||
      body.maxTotalCalls ||
      body.maxCopilotCalls
    );
    const options = hasLimits
      ? {
          maxSites: body.maxSites,
          maxQueries: body.maxQueries,
          platforms: body.platforms,
          maxTotalCalls: body.maxTotalCalls,
          maxCopilotCalls: body.maxCopilotCalls,
          label: 'admin-limited',
        }
      : { label: 'admin-full' };

    // Run in background to avoid HTTP timeout
    this.service.runIndustryTest(normalizedIndustry, options).catch((err) => {
      console.error(`Industry AI test failed for ${normalizedIndustry}:`, err);
    });
    return {
      message: `Industry AI test started for ${normalizedIndustry}`,
      status: 'running',
      mode: hasLimits ? 'limited' : 'full',
      options,
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('queries')
  @ApiOperation({ summary: 'Seed industry queries (admin)' })
  seedQueries(@Body() body: SeedIndustryQueriesDto) {
    return this.service.seedQueries(this.normalizeIndustry(body.industry), body.queries);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get(':industry/queries')
  @ApiOperation({ summary: 'List industry queries (admin)' })
  getQueries(@Param('industry') industry: string) {
    return this.service.getQueries(this.normalizeIndustry(industry));
  }
}
