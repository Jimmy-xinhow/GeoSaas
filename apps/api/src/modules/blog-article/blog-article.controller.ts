import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BlogArticleService } from './blog-article.service';

@ApiTags('Blog')
@Controller('api/blog')
export class BlogArticleController {
  constructor(private readonly service: BlogArticleService) {}

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
}
