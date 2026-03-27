import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { BlogArticleService } from './blog-article.service';
import { IndustryInsightService, InsightType } from './industry-insight.service';

@ApiTags('Blog')
@Controller('blog')
export class BlogArticleController {
  constructor(
    private readonly service: BlogArticleService,
    private readonly insightService: IndustryInsightService,
  ) {}

  @Public()
  @Get('articles')
  @ApiOperation({ summary: 'List published blog articles' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('locale') locale?: string,
  ) {
    return this.service.listArticles({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 12,
      category: category || undefined,
      locale: locale || undefined,
    });
  }

  @Public()
  @Get('articles/:slug')
  @ApiOperation({ summary: 'Get article by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }

  @ApiBearerAuth()
  @Post('generate/:siteId')
  @ApiOperation({ summary: 'Generate AI analysis article for a site' })
  generate(@Param('siteId') siteId: string) {
    return this.service.generateSiteAnalysis(siteId);
  }

  @ApiBearerAuth()
  @Post('batch-generate')
  @ApiOperation({ summary: 'Batch generate articles for public sites without one' })
  batchGenerate() {
    return this.service.batchGenerateAnalyses();
  }

  @ApiBearerAuth()
  @Post('generate-templates/:siteId')
  @ApiOperation({ summary: 'Generate all template-based AI articles for a site' })
  generateTemplates(@Param('siteId') siteId: string) {
    return this.service.generateArticlesForSite(siteId);
  }

  @ApiBearerAuth()
  @Post('generate-bulk-templates')
  @ApiOperation({ summary: 'Trigger bulk template generation for all eligible sites' })
  async generateBulkTemplates() {
    // Fire-and-forget
    this.service.scheduledBulkGeneration().catch((err) => {
      console.error('Bulk generation failed:', err);
    });
    return { message: 'Bulk generation started' };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('quality-audit')
  @ApiOperation({ summary: 'Delete articles below quality threshold and return stats' })
  async qualityAudit(@Query('threshold') threshold?: string) {
    const minScore = threshold ? parseInt(threshold, 10) : 85;
    return this.service.qualityAudit(minScore);
  }

  @ApiBearerAuth()
  @Post('insights/generate')
  @ApiOperation({ summary: 'Generate insight article for an industry' })
  generateInsight(@Body() body: { industry: string; type?: InsightType }) {
    return this.insightService.generateInsightArticle(
      body.industry,
      body.type || 'industry_current_state',
    );
  }

  @ApiBearerAuth()
  @Post('insights/generate-all')
  @ApiOperation({ summary: 'Generate industry_current_state for all eligible industries' })
  async generateAllInsights() {
    this.insightService.generateAll().catch((err) => {
      console.error('Insight generation failed:', err);
    });
    return { message: 'Insight generation started' };
  }
}
