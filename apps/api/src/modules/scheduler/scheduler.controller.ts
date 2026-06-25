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

type AutomationStatus = 'healthy' | 'warning' | 'critical';

const CONTENT_TASK_KEYS = [
  'blog_bulk_generation',
  'auto_fill_articles',
  'auto_fill_qa',
  'client_daily_content',
  'client_daily_sentinel',
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
  client_daily_content: '客戶每日引用內容',
  client_daily_sentinel: '客戶每日內容哨兵',
  indexnow_batch_submit: 'IndexNow 批量推送',
  directory_seo_recovery: '目錄 SEO 修復',
  retry_failed_seeds: '失敗 Seed 重試',
  auto_discover_businesses: '自動探索品牌',
  enrich_industry_content: '產業 Q&A 補強',
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clientDailyDayType(date: Date): string | null {
  return [
    null,
    'mon_topical',
    'tue_qa_deepdive',
    'wed_service',
    'thu_audience',
    'fri_comparison',
    'sat_data_pulse',
  ][date.getUTCDay()] ?? null;
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

function activeDaysForClient(plan: string | null | undefined, role: string | null | undefined) {
  const planActiveDays: Record<string, string[]> = {
    PRO: ['tue_qa_deepdive', 'fri_comparison', 'sat_data_pulse'],
    STARTER: ['tue_qa_deepdive'],
  };
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'STAFF') {
    return planActiveDays.PRO;
  }
  return planActiveDays[plan || 'FREE'] || [];
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
    const todayDayType = clientDailyDayType(now);

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
          templateType: true,
          site: { select: { name: true, url: true, isPublic: true } },
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
    ]);

    const expectedToday = todayDayType
      ? clientSites.filter((site) => {
          const profile = (site.profile as Record<string, unknown>) || {};
          if (profile.dailyContentPaused === true) return false;
          return activeDaysForClient(site.user?.plan, site.user?.role).includes(todayDayType);
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

    const rows = tasks.map((task) => {
      const status = classifyTask(task, now);
      return {
        key: task.taskKey,
        name: TASK_LABELS[task.taskKey] ?? task.name ?? task.taskKey,
        area: 'scheduler',
        status,
        enabled: task.enabled,
        cronExpr: task.cronExpr,
        lastRunAt: task.lastRunAt,
        nextRunAt: task.nextRunAt,
        lastResult: task.lastResult,
        evidence: task.lastResult?.startsWith('error:')
          ? task.lastResult
          : task.lastRunAt
            ? `上次執行：${task.lastRunAt.toISOString()}`
            : '尚無執行紀錄',
        action: status === 'critical'
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
