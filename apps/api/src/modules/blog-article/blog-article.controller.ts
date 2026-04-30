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
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('preview/brand-showcase/:siteId')
  @ApiOperation({
    summary:
      'Preview a brand_showcase article without saving. Body may include description/services/location/contact/forbidden/positioning overrides.',
  })
  previewBrandShowcase(
    @Param('siteId') siteId: string,
    @Body() body: {
      description?: string;
      services?: string;
      location?: string;
      contact?: string;
      forbidden?: string[];
      positioning?: string;
    } = {},
  ) {
    return this.service.previewBrandShowcase(siteId, body);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('brand-showcase/generate/:siteId')
  @ApiOperation({
    summary:
      'Generate + persist one brand_showcase article for a site. Respects the 90-day cooldown; pass ?force=true to bypass.',
  })
  generateBrandShowcase(
    @Param('siteId') siteId: string,
    @Query('force') force?: string,
  ) {
    return this.service.generateBrandShowcaseForSite(siteId, {
      force: force === 'true' || force === '1',
    });
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('brand-showcase/batch')
  @ApiOperation({
    summary:
      'Kick off a brand_showcase batch (fire-and-forget, returns immediately). ?limit=30 (default 15, max 200). Use /blog/brand-showcase/batch-status to check progress.',
  })
  brandShowcaseBatch(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(200, limit ? parseInt(limit, 10) : 15));
    // Fire-and-forget so Cloudflare (100s) / Railway proxies don't drop us.
    // Results land in DB + service logs; poll /batch-status for progress.
    this.service.runBrandShowcaseBatch(n).catch((err) => {
      console.error('brand_showcase batch crashed:', err);
    });
    return { message: 'batch started', limit: n, pollAt: '/blog/brand-showcase/batch-status' };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('brand-showcase/batch-status')
  @ApiOperation({
    summary:
      'Latest aggregate stats for brand_showcase: total, last 24h, average quality metrics from an in-memory ring of recent batch runs.',
  })
  brandShowcaseStatus() {
    return this.service.getBrandShowcaseStatus();
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('brand-showcase/all')
  @ApiOperation({
    summary:
      'Delete every brand_showcase article. Escape hatch for when quality rules change and prior generations are no longer trusted.',
  })
  deleteAllBrandShowcase() {
    return this.service.deleteAllBrandShowcase();
  }

  // ─── Layer 2: Industry Top 10 ───

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('industry-top10/generate/:industry')
  @ApiOperation({
    summary:
      'Generate one Top 10 ranking article for a specific industry slug (e.g. restaurant, dental). Replaces any prior ranking.',
  })
  generateIndustryTop10(@Param('industry') industry: string) {
    return this.service.generateIndustryTop10(industry);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('industry-top10/batch')
  @ApiOperation({
    summary:
      'Fire-and-forget batch: run industry_top10 for every supported industry. Use the monthly cron for automation.',
  })
  runIndustryTop10Batch() {
    this.service.runIndustryTop10Batch().catch((err) => {
      console.error('industry_top10 batch crashed:', err);
    });
    return { message: 'industry_top10 batch started' };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('resubmit-migrated/indexnow')
  @ApiOperation({
    summary:
      'One-shot: push every article whose slug was rewritten (aliasSlugs not empty) to IndexNow. Use after the CJK→ASCII migration so engines re-crawl the new URLs.',
  })
  async resubmitMigratedToIndexNow() {
    return this.service.resubmitMigratedArticlesToIndexNow();
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('resubmit-all/indexnow')
  @ApiOperation({
    summary:
      'Bulk-resubmit every brand_showcase + industry_top10 article URL to IndexNow engines. Use after a major content push when you want Bing/Yandex to re-crawl the whole AI-Wikipedia corpus immediately.',
  })
  async resubmitAllToIndexNow() {
    return this.service.resubmitAllAiWikiArticlesToIndexNow();
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('preview/buyer-guide/:industry')
  @ApiOperation({
    summary:
      'Preview a Layer-3 buyer_guide article without saving. ?topic=how_to_choose|red_flags|beginner_primer. Used to validate the angle before wiring a production cron.',
  })
  previewBuyerGuide(
    @Param('industry') industry: string,
    @Query('topic') topic?: string,
  ) {
    const t = (topic === 'red_flags' || topic === 'beginner_primer') ? topic : 'how_to_choose';
    return this.service.previewBuyerGuide(industry, t);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('buyer-guide/generate/:industry')
  @ApiOperation({
    summary:
      '產出一篇 Layer 3 buyer_guide 並存到 DB(replaces 同 industry + topic 的舊版)。?topic=how_to_choose|red_flags|beginner_primer。',
  })
  generateBuyerGuide(
    @Param('industry') industry: string,
    @Query('topic') topic?: string,
  ) {
    const t = (topic === 'red_flags' || topic === 'beginner_primer') ? topic : 'how_to_choose';
    return this.service.generateBuyerGuide(industry, t);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('buyer-guide/batch')
  @ApiOperation({
    summary:
      'Fire-and-forget 全量 buyer_guide batch — 29 產業 × 3 topic = 87 篇。季度 cron 會自動跑,手動用於 prompt 改版後立即重產。',
  })
  runBuyerGuideBatch() {
    this.service.runBuyerGuideBatch().catch((err) => {
      console.error('buyer_guide batch crashed:', err);
    });
    return { message: 'buyer_guide batch started', estimatedJobs: 87 };
  }

  // ─── Layer 4: Client Daily Content ─────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('client-daily/generate/:siteId')
  @ApiOperation({
    summary:
      '手動觸發單一付費客戶今日的 daily content 生成。用於驗證 prompt + plan 配額邏輯。可選 ?dayType=mon_topical|tue_qa_deepdive|wed_service|thu_audience|fri_comparison|sat_data_pulse 補指定天份。',
  })
  triggerClientDaily(
    @Param('siteId') siteId: string,
    @Query('dayType') dayType?: string,
  ) {
    return this.service.generateClientDailyContent(siteId, dayType as any);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('client-daily/batch')
  @ApiOperation({
    summary:
      '立即執行今天的 client_daily batch(isClient=true 全部,依 Plan 配額過濾)。排程 cron 已設 08:00 UTC,此為手動觸發。',
  })
  runClientDailyBatch() {
    this.service.runClientDailyBatch().catch((err) => {
      console.error('client_daily batch crashed:', err);
    });
    return { message: 'client_daily batch started' };
  }

  @ApiBearerAuth()
  @Get('client-daily/stats/:siteId')
  @ApiOperation({
    summary:
      '付費客戶 daily content 累積統計 — 本月 / 本週 / 總數 + 最近 10 篇 + 方案配額。Dashboard 要顯示的「本月累積 N 篇」就是這支。',
  })
  getClientDailyStats(@Param('siteId') siteId: string) {
    return this.service.getClientDailyStats(siteId);
  }

  @ApiBearerAuth()
  @Get('client-daily/list/:siteId')
  @ApiOperation({
    summary:
      '付費客戶 daily content 完整歷史(分頁)。客戶要看 Geovault 替他發布的每一篇。',
  })
  listClientDaily(
    @Param('siteId') siteId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listClientDaily(siteId, {
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      limit: limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 30,
    });
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
