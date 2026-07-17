import { BadRequestException, Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CronManagerService } from './cron-manager.service';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import cronParser from 'cron-parser';
import { UpdateScheduledTaskDto } from './update-scheduled-task.dto';
import {
  getPublicBlogArticleSeoIssues,
  publicIndexableBlogArticleWhere,
} from '../../common/utils/public-data-filter';
import {
  clientDailyDayTypeForDate,
  getClientDailyActiveDays,
} from '../blog-article/client-daily-policy';
import {
  auditPublishedArticleShadow,
  isLegacyGeoGenerationEnabled,
  LEGACY_GEO_TEMPLATE_TYPES,
  QUALITY_GATED_TEMPLATE_TYPES,
} from '../blog-article/legacy-geo-content-audit';
import {
  LEGACY_REPLACEMENT_APPLY_ENV,
  LegacyContentReplacementService,
} from '../blog-article/legacy-content-replacement.service';

type AutomationStatus = 'healthy' | 'warning' | 'critical';

const CONTENT_TASK_KEYS = [
  'blog_bulk_generation',
  'auto_fill_articles',
  'auto_fill_qa',
  'client_daily_content',
  'client_daily_sentinel',
  'ai_platform_official_monitor',
  'published_article_crawler_audit',
  'brand_profile_rollout',
  'legacy_content_replacement',
  'indexnow_batch_submit',
  'directory_seo_recovery',
  'retry_failed_seeds',
  'auto_discover_businesses',
  'enrich_industry_content',
];

const TASK_LABELS: Record<string, string> = {
  blog_bulk_generation: '大量長尾文章補齊',
  auto_fill_articles: '品牌文章自動補齊',
  auto_fill_qa: '知識庫 Q&A 自動補齊',
  client_daily_content: '客戶方案配額引用內容',
  client_daily_sentinel: '客戶每日內容哨兵',
  ai_platform_official_monitor: 'AI 官方規則週監控',
  published_article_crawler_audit: '已公開文章爬蟲成效稽核',
  brand_profile_rollout: '引用就緒品牌頁逐步替換',
  legacy_content_replacement: '舊型 GEO 文章安全替換',
  indexnow_batch_submit: 'IndexNow 批量推送',
  directory_seo_recovery: '目錄 SEO 修復',
  retry_failed_seeds: '失敗 Seed 重試',
  auto_discover_businesses: '自動探索品牌',
  enrich_industry_content: '產業 Q&A 補強',
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function extractBlogSlugFromUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/^\/blog\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    const match = value.match(/\/blog\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function classifyTask(task: {
  enabled: boolean;
  lastRunAt: Date | null;
  lastResult: string | null;
  nextRunAt: Date | null;
}, now: Date): AutomationStatus {
  if (!task.enabled) return 'critical';
  if (task.lastResult?.startsWith('error:')) return 'critical';
  if (!task.lastRunAt) return 'warning';
  if (task.nextRunAt && task.nextRunAt.getTime() < now.getTime() - 2 * 60 * 60 * 1000) {
    return 'warning';
  }
  return 'healthy';
}

@ApiTags('Admin — Scheduler')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/scheduler')
export class SchedulerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cronManager: CronManagerService,
    private readonly legacyReplacement: LegacyContentReplacementService,
  ) {}

  @Get('tasks')
  @ApiOperation({ summary: 'List all scheduled tasks with status' })
  async listTasks() {
    return this.prisma.scheduledTask.findMany({
      orderBy: { taskKey: 'asc' },
    });
  }

  @Get('automation-health')
  @ApiOperation({ summary: 'Summarize content automation health, blockers, and SEO usefulness' })
  async automationHealth() {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const todayDayType = clientDailyDayTypeForDate(now);

    const [
      tasks,
      clientSites,
      clientDailyTotal,
      clientDailyPublished,
      clientDailyUnpublished,
      clientDailyRecent,
      qualityRecentFailed,
      indexableArticles,
      publishedArticleSamples,
      seedCounts,
      lowQualityPublicSeeds,
      crawler24h,
      crawler7d,
      articleCrawlerVisits,
      legacyTemplateCounts,
      qualityGatedPublished,
      legacyReplacementStatus,
    ] = await Promise.all([
      this.prisma.scheduledTask.findMany({
        where: { taskKey: { in: CONTENT_TASK_KEYS } },
        orderBy: { taskKey: 'asc' },
      }),
      this.prisma.site.findMany({
        where: { isClient: true, isPublic: true },
        select: {
          id: true,
          name: true,
          profile: true,
          user: { select: { plan: true, role: true } },
        },
      }),
      this.prisma.blogArticle.count({ where: { templateType: 'client_daily' } }),
      this.prisma.blogArticle.count({ where: { templateType: 'client_daily', published: true } }),
      this.prisma.blogArticle.count({ where: { templateType: 'client_daily', published: false } }),
      this.prisma.blogArticle.count({
        where: { templateType: 'client_daily', createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.articleQualityLog.count({
        where: {
          passed: false,
          createdAt: { gte: sevenDaysAgo },
          OR: [
            { templateType: { startsWith: 'client_daily' } },
            { templateType: { startsWith: 'brand_showcase' } },
            { templateType: { startsWith: 'industry_top10' } },
            { templateType: { startsWith: 'buyer_guide' } },
          ],
        },
      }),
      this.prisma.blogArticle.count({
        where: publicIndexableBlogArticleWhere({ published: true }),
      }),
      this.prisma.blogArticle.findMany({
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          slug: true,
          title: true,
          description: true,
          content: true,
          category: true,
          templateType: true,
          createdAt: true,
          site: { select: { name: true, url: true, industry: true, isPublic: true } },
        },
      }),
      Promise.all([
        this.prisma.seedSource.count(),
        this.prisma.seedSource.count({ where: { status: 'pending' } }),
        this.prisma.seedSource.count({ where: { status: 'failed' } }),
        this.prisma.seedSource.count({ where: { status: 'scanned' } }),
      ]),
      this.prisma.site.count({
        where: {
          isPublic: true,
          isClient: false,
          bestScore: { lt: 60 },
          user: { is: { email: 'system@geovault.local' } },
          seedSource: { is: { status: 'scanned' } },
        },
      }),
      this.prisma.crawlerVisit.count({
        where: { isSeeded: false, visitedAt: { gte: new Date(now.getTime() - 86400000) } },
      }),
      this.prisma.crawlerVisit.count({
        where: { isSeeded: false, visitedAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.crawlerVisit.findMany({
        where: {
          isSeeded: false,
          visitedAt: { gte: thirtyDaysAgo },
          OR: [
            { url: { contains: 'geovault.app/blog/' } },
            { url: { contains: 'www.geovault.app/blog/' } },
          ],
        },
        orderBy: { visitedAt: 'desc' },
        select: {
          url: true,
          botName: true,
          botOrg: true,
          visitedAt: true,
        },
      }),
      this.prisma.blogArticle.groupBy({
        by: ['templateType'],
        where: {
          published: true,
          category: { not: 'case-study' },
          templateType: { in: [...LEGACY_GEO_TEMPLATE_TYPES] },
        },
        _count: { _all: true },
      }),
      this.prisma.blogArticle.count({
        where: {
          published: true,
          templateType: { in: [...QUALITY_GATED_TEMPLATE_TYPES] },
        },
      }),
      this.legacyReplacement.getStatus(20),
    ]);

    const legacyGenerationEnabled = isLegacyGeoGenerationEnabled(
      process.env.LEGACY_GEO_BULK_ENABLED,
    );
    const legacyReplacementApplyEnabled =
      process.env[LEGACY_REPLACEMENT_APPLY_ENV] === '1';
    const legacyByTemplateType = Object.fromEntries(
      legacyTemplateCounts.map((row) => [row.templateType, row._count._all]),
    );
    const legacyPublishedTotal = legacyTemplateCounts.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const shadowFlaggedSamples = publishedArticleSamples
      .map((article) => ({
        article,
        issues: auditPublishedArticleShadow(article),
      }))
      .filter((result) => result.issues.length > 0);
    const shadowIssueCounts = shadowFlaggedSamples.reduce<Record<string, number>>(
      (counts, result) => {
        for (const issue of result.issues) counts[issue] = (counts[issue] ?? 0) + 1;
        return counts;
      },
      {},
    );

    const expectedToday = todayDayType
      ? clientSites.filter((site) => {
          const profile = (site.profile as Record<string, unknown>) || {};
          if (profile.dailyContentPaused === true) return false;
          return getClientDailyActiveDays(site.user?.plan, site.user?.role, profile).includes(todayDayType);
        })
      : [];
    const actualToday = todayDayType && expectedToday.length > 0
      ? await this.prisma.blogArticle.count({
          where: {
            templateType: 'client_daily',
            published: true,
            createdAt: { gte: todayStart },
            targetKeywords: { has: todayDayType },
            siteId: { in: expectedToday.map((site) => site.id) },
          },
        })
      : 0;

    const nonIndexablePublishedSamples = publishedArticleSamples.filter((article) => {
      if (article.site && article.site.isPublic === false) return true;
      return getPublicBlogArticleSeoIssues(article).length > 0;
    });

    const publishedArticleMap = new Map(publishedArticleSamples.map((article) => [article.slug, article]));
    const articleCrawlerMap = new Map<string, {
      slug: string;
      title: string;
      templateType: string;
      siteName: string | null;
      publishedAt: Date;
      last24h: number;
      last7d: number;
      last30d: number;
      lastVisitAt: Date | null;
      bots: Map<string, { botName: string; botOrg: string; count: number }>;
    }>();

    for (const article of publishedArticleSamples) {
      articleCrawlerMap.set(article.slug, {
        slug: article.slug,
        title: article.title,
        templateType: article.templateType,
        siteName: article.site?.name ?? null,
        publishedAt: article.createdAt,
        last24h: 0,
        last7d: 0,
        last30d: 0,
        lastVisitAt: null,
        bots: new Map(),
      });
    }

    for (const visit of articleCrawlerVisits) {
      const slug = extractBlogSlugFromUrl(visit.url);
      if (!slug || !publishedArticleMap.has(slug)) continue;
      const row = articleCrawlerMap.get(slug);
      if (!row) continue;
      row.last30d++;
      if (visit.visitedAt >= sevenDaysAgo) row.last7d++;
      if (visit.visitedAt >= new Date(now.getTime() - 86400000)) row.last24h++;
      if (!row.lastVisitAt || visit.visitedAt > row.lastVisitAt) row.lastVisitAt = visit.visitedAt;
      const bot = row.bots.get(visit.botName) ?? {
        botName: visit.botName,
        botOrg: visit.botOrg,
        count: 0,
      };
      bot.count++;
      row.bots.set(visit.botName, bot);
    }

    const articleCrawlerRows = Array.from(articleCrawlerMap.values())
      .map((row) => {
        const ageDays = Math.max(1, Math.ceil((now.getTime() - row.publishedAt.getTime()) / 86400000));
        return {
          slug: row.slug,
          title: row.title,
          templateType: row.templateType,
          siteName: row.siteName,
          publishedAt: row.publishedAt,
          last24h: row.last24h,
          last7d: row.last7d,
          last30d: row.last30d,
          visitsPerDay30d: Number((row.last30d / Math.min(ageDays, 30)).toFixed(2)),
          lastVisitAt: row.lastVisitAt,
          bots: Array.from(row.bots.values()).sort((a, b) => b.count - a.count).slice(0, 5),
        };
      })
      .sort((a, b) => b.last7d - a.last7d || b.last30d - a.last30d || (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0));

    const articleCrawler24h = articleCrawlerRows.reduce((sum, row) => sum + row.last24h, 0);
    const articleCrawler7d = articleCrawlerRows.reduce((sum, row) => sum + row.last7d, 0);
    const articleCrawler30d = articleCrawlerRows.reduce((sum, row) => sum + row.last30d, 0);
    const articleCrawlerVisited30d = articleCrawlerRows.filter((row) => row.last30d > 0).length;

    const rows = tasks.map((task) => {
      const isLegacyGenerationTask = ['blog_bulk_generation', 'auto_fill_articles'].includes(task.taskKey);
      const status: AutomationStatus = isLegacyGenerationTask && !legacyGenerationEnabled
        ? 'healthy'
        : classifyTask(task, now);
      return {
        key: task.taskKey,
        name: TASK_LABELS[task.taskKey] ?? task.name ?? task.taskKey,
        area: 'scheduler',
        status,
        enabled: isLegacyGenerationTask && !legacyGenerationEnabled ? false : task.enabled,
        cronExpr: task.cronExpr,
        lastRunAt: task.lastRunAt,
        nextRunAt: task.nextRunAt,
        lastResult: task.lastResult,
        evidence: isLegacyGenerationTask && !legacyGenerationEnabled
          ? '舊型 GEO 補文已由系統開關凍結，不會影響客戶每週文章'
          : task.lastResult?.startsWith('error:')
          ? task.lastResult
          : task.lastRunAt
            ? `上次執行：${task.lastRunAt.toISOString()}`
            : '尚無執行紀錄',
        action: isLegacyGenerationTask && !legacyGenerationEnabled
          ? '維持凍結；改由 brand_profile、FAQ 與 client_daily 品質管線產出'
          : status === 'critical'
          ? '檢查排程是否停用或執行錯誤，可在排程管理手動執行'
          : status === 'warning'
            ? '觀察下次排程或手動執行一次確認'
            : '正常',
      };
    });

    const clientDailyStatus: AutomationStatus =
      todayDayType && expectedToday.length > 0 && actualToday === 0
        ? 'critical'
        : clientDailyUnpublished > 0 || qualityRecentFailed > 0
          ? 'warning'
          : 'healthy';

    rows.push({
      key: 'client_daily_publication',
      name: '客戶每日文章公開成效',
      area: 'content',
      status: clientDailyStatus,
      enabled: true,
      cronExpr: 'derived',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: `今日應產出 ${expectedToday.length} 篇，已公開 ${actualToday} 篇；近 7 天 client_daily ${clientDailyRecent} 篇，未公開 ${clientDailyUnpublished} 篇`,
      action: clientDailyStatus === 'critical'
        ? '手動執行 client_daily_content 並檢查 ArticleQualityLog 失敗原因'
        : clientDailyUnpublished > 0
          ? '到「為您發布的內容」審查可公開文章，或修正被擋原因'
          : '正常',
    });

    rows.push({
      key: 'public_indexable_content',
      name: '公開文章可索引性',
      area: 'seo',
      status: nonIndexablePublishedSamples.length > 0 ? 'warning' : 'healthy',
      enabled: true,
      cronExpr: 'derived',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: `目前公開可索引文章 ${indexableArticles} 篇；最近 500 篇公開文章中 ${nonIndexablePublishedSamples.length} 篇有 SEO 阻擋`,
      action: nonIndexablePublishedSamples.length > 0
        ? '下架或修復 short title/thin description/non-public site 文章'
        : '正常',
    });

    rows.push({
      key: 'legacy_geo_generation_guard',
      name: '舊型 GEO 文章生成保護',
      area: 'content-safety',
      status: legacyGenerationEnabled ? 'warning' : 'healthy',
      enabled: !legacyGenerationEnabled,
      cronExpr: 'environment-guard',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: legacyGenerationEnabled
        ? `舊模板生成已明確開啟；目前仍有 ${legacyPublishedTotal} 篇舊型公開文章`
        : `舊模板生成入口已全面凍結；目前 ${legacyPublishedTotal} 篇舊文只觀測、不自動下架`,
      action: legacyGenerationEnabled
        ? '確認是否為必要的短期維運；完成後將 LEGACY_GEO_BULK_ENABLED 改回 0'
        : '正常；每週 client_daily 使用獨立管線，持續照方案交付',
    });

    rows.push({
      key: 'published_content_shadow_audit',
      name: '公開內容影子品質稽核',
      area: 'content-quality',
      status: shadowFlaggedSamples.length > 0 ? 'warning' : 'healthy',
      enabled: true,
      cronExpr: 'read-only',
      lastRunAt: now,
      nextRunAt: null,
      lastResult: null,
      evidence: `最近 ${publishedArticleSamples.length} 篇公開文章中，${shadowFlaggedSamples.length} 篇有舊模板、內部策略語句或醫療宣稱風險`,
      action: shadowFlaggedSamples.length > 0
        ? '先依影子稽核清單規劃替換；本檢查不下架文章、不阻擋每週交付'
        : '正常',
    });

    rows.push({
      key: 'legacy_replacement_progress',
      name: '舊型 GEO 文章替換進度',
      area: 'content-migration',
      status: legacyReplacementStatus.legacyPublishedWithoutReplacement > 0 ? 'warning' : 'healthy',
      enabled: legacyReplacementApplyEnabled,
      cronExpr: '30 7 * * *',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: `自動套用${legacyReplacementApplyEnabled ? '已開啟' : '仍為預演'}；可立即安全替換 ${legacyReplacementStatus.legacyPublishedWithReplacement} 篇；尚缺 brand_profile 的舊文 ${legacyReplacementStatus.legacyPublishedWithoutReplacement} 篇`,
      action: !legacyReplacementApplyEnabled
        ? `先用 Admin API 套用 5 個網站並驗證舊網址，再設定 ${LEGACY_REPLACEMENT_APPLY_ENV}=1`
        : legacyReplacementStatus.legacyPublishedWithoutReplacement > 0
          ? '持續執行 brand_profile_rollout；只有通過 CRG 才會轉移舊網址並下架舊文'
          : '正常',
    });

    rows.push({
      key: 'published_article_crawler_frequency',
      name: '已發佈文章爬蟲頻率',
      area: 'crawler',
      status: articleCrawler30d > 0 ? 'healthy' : 'warning',
      enabled: true,
      cronExpr: 'derived',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: `近 24 小時 ${articleCrawler24h} 次，近 7 天 ${articleCrawler7d} 次，近 30 天 ${articleCrawler30d} 次；最近 500 篇公開文章中 ${articleCrawlerVisited30d} 篇有文章頁爬蟲紀錄`,
      action: articleCrawler30d > 0
        ? '持續觀察文章發布後 7 天內是否有 GPTBot、ClaudeBot、PerplexityBot、Googlebot 等造訪'
        : '確認文章 sitemap、IndexNow、llms-full 與 middleware 平台爬蟲回報是否正常',
    });

    rows.push({
      key: 'seed_public_quality',
      name: 'Seed 公開品質',
      area: 'seed',
      status: lowQualityPublicSeeds > 0 ? 'critical' : 'healthy',
      enabled: true,
      cronExpr: 'derived',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      evidence: `低於 60 分仍公開的系統 seed：${lowQualityPublicSeeds} 筆`,
      action: lowQualityPublicSeeds > 0
        ? '執行「隔離低品質公開 Seed」'
        : '正常',
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total++;
        acc[row.status]++;
        return acc;
      },
      { total: 0, healthy: 0, warning: 0, critical: 0 } as Record<AutomationStatus | 'total', number>,
    );

    return {
      generatedAt: now.toISOString(),
      summary,
      content: {
        clientDailyTotal,
        clientDailyPublished,
        clientDailyUnpublished,
        clientDailyRecent7d: clientDailyRecent,
        clientDailyExpectedToday: expectedToday.length,
        clientDailyPublishedToday: actualToday,
        qualityFailedAttempts7d: qualityRecentFailed,
        publicIndexableArticles: indexableArticles,
        nonIndexablePublishedSamples: nonIndexablePublishedSamples.slice(0, 20).map((article) => ({
          slug: article.slug,
          title: article.title,
          issues: [
            ...(article.site?.isPublic === false ? ['non-public-site'] : []),
            ...getPublicBlogArticleSeoIssues(article),
          ],
        })),
        legacyGeo: {
          generationEnabled: legacyGenerationEnabled,
          generationFrozen: !legacyGenerationEnabled,
          publishedTotal: legacyPublishedTotal,
          byTemplateType: legacyByTemplateType,
          qualityGatedPublished,
          shadowSampleSize: publishedArticleSamples.length,
          shadowFlagged: shadowFlaggedSamples.length,
          shadowIssueCounts,
          flaggedSamples: shadowFlaggedSamples.slice(0, 20).map(({ article, issues }) => ({
            slug: article.slug,
            title: article.title,
            templateType: article.templateType,
            issues,
          })),
          weeklyClientDailyProtected: true,
          replacement: {
            ...legacyReplacementStatus,
            automaticApplyEnabled: legacyReplacementApplyEnabled,
          },
        },
      },
      seed: {
        total: seedCounts[0],
        pending: seedCounts[1],
        failed: seedCounts[2],
        scanned: seedCounts[3],
        lowQualityPublicSeeds,
        publicScoreThreshold: 60,
      },
      crawler: {
        real24h: crawler24h,
        real7d: crawler7d,
        article24h: articleCrawler24h,
        article7d: articleCrawler7d,
        article30d: articleCrawler30d,
        articleTrackedArticles: articleCrawlerRows.length,
        articleWithVisits30d: articleCrawlerVisited30d,
        topArticleVisits: articleCrawlerRows.slice(0, 20),
      },
      rows: rows.sort((a, b) => {
        const rank: Record<AutomationStatus, number> = { critical: 0, warning: 1, healthy: 2 };
        return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, 'zh-Hant');
      }),
    };
  }

  @Patch('tasks/:taskKey')
  @ApiOperation({ summary: 'Update a scheduled task (cron, enabled, etc.)' })
  async updateTask(
    @Param('taskKey') taskKey: string,
    @Body() body: UpdateScheduledTaskDto,
  ) {
    const data: any = {};

    if (body.cronExpr !== undefined) {
      const cronExpr = body.cronExpr.trim();
      // Validate cron expression
      try {
        cronParser.parseExpression(cronExpr);
      } catch {
        throw new BadRequestException('Invalid cron expression');
      }
      data.cronExpr = cronExpr;
      data.nextRunAt = cronParser.parseExpression(cronExpr).next().toDate();
    }
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('name is required');
      data.name = name;
    }
    if (body.description !== undefined) data.description = body.description.trim();

    return this.prisma.scheduledTask.update({
      where: { taskKey },
      data,
    });
  }

  @Post('tasks/:taskKey/run')
  @ApiOperation({ summary: 'Manually trigger a task immediately' })
  async runTask(@Param('taskKey') taskKey: string) {
    const task = await this.cronManager.runTaskNow(taskKey);
    return { message: `Task ${taskKey} completed`, task };
  }
}
