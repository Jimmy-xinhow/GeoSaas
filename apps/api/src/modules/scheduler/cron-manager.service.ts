import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import cronParser from 'cron-parser';

export interface TaskHandler {
  (): Promise<void>;
}

/** Default tasks to seed into DB on first boot */
const DEFAULT_TASKS: Array<{
  taskKey: string;
  name: string;
  description: string;
  cronExpr: string;
  enabled: boolean;
}> = [
  {
    taskKey: 'robots_check',
    name: 'robots.txt AI Bot 偵測',
    description: '檢查所有網站的 robots.txt 是否允許 AI 爬蟲',
    cronExpr: '0 1 * * *',
    enabled: true,
  },
  {
    taskKey: 'tier_recalculation',
    name: '等級重算',
    description: '重算所有公開網站的 tier（Bronze → Platinum）',
    cronExpr: '0 2 * * *',
    enabled: true,
  },
  {
    taskKey: 'blog_bulk_generation',
    name: '批量文章補齊',
    description: '為近 7 天有掃描但文章 < 3 篇的網站生成 AI 文章',
    cronExpr: '0 2 * * *',
    enabled: true,
  },
  {
    taskKey: 'monitor_daily_pro',
    name: 'Pro 用戶 AI 引用監控',
    description: 'PRO 用戶的每日 AI 引用偵測',
    cronExpr: '0 3 * * *',
    enabled: true,
  },
  {
    taskKey: 'monitor_weekly_free',
    name: 'Free 用戶 AI 引用監控',
    description: 'FREE/Starter 用戶的每週 AI 引用偵測',
    cronExpr: '0 4 * * 1',
    enabled: true,
  },
  {
    taskKey: 'weekly_industry_insights',
    name: '行業洞察文章',
    description: '每週輪流為各行業生成一種洞察文章',
    cronExpr: '0 3 * * 1',
    enabled: true,
  },
  {
    taskKey: 'crawler_monthly_cleanup',
    name: '爬蟲資料月度清理',
    description: '清除 90 天前的爬蟲造訪紀錄',
    cronExpr: '0 3 1 * *',
    enabled: true,
  },
  {
    taskKey: 'auto_rescan',
    name: '自動重新掃描',
    description: '每週重新掃描 30 天內未掃描的公開網站，更新分數',
    cronExpr: '0 5 * * 3',
    enabled: true,
  },
  {
    taskKey: 'indexnow_batch_submit',
    name: 'IndexNow 批次提交',
    description: '每週將所有公開頁面重新提交 IndexNow，提醒搜尋引擎',
    cronExpr: '0 6 * * 1',
    enabled: true,
  },
  {
    taskKey: 'directory_seo_recovery',
    name: '目錄 SEO 可索引性修復',
    description: '每天補齊接近可索引的公開站點資料與基礎 Q&A，避免 sitemap 可收錄頁面因資料不足下滑',
    cronExpr: '0 7 * * *',
    enabled: true,
  },
  {
    taskKey: 'retry_failed_seeds',
    name: '自動重試失敗 Seed',
    description: '每週自動重試所有失敗的 seed 掃描',
    cronExpr: '0 5 * * 0',
    enabled: true,
  },
  {
    taskKey: 'auto_discover_businesses',
    name: '自動發現新商家',
    description: '每天搜尋各產業新商家，自動收錄並掃描 GEO 分數',
    cronExpr: '0 4 * * *',
    enabled: true,
  },
  {
    taskKey: 'enrich_industry_content',
    name: '產業內容自動擴充',
    description: '每天從網路抓取產業評論/討論，AI 生成 Q&A 擴充知識庫',
    cronExpr: '0 5 * * *',
    enabled: true,
  },
  {
    taskKey: 'auto_fill_qa',
    name: '自動補齊品牌知識庫',
    description: '為知識庫不足的客戶站點自動生成 Q&A',
    cronExpr: '0 6 * * *',
    enabled: true,
  },
  {
    taskKey: 'ai_platform_official_monitor',
    name: 'AI platform official guidance monitor',
    description: 'Weekly monitor for official AI crawler/search guidance from OpenAI, Anthropic, Perplexity, Google, and Bing.',
    cronExpr: '0 2 * * 1',
    enabled: true,
  },
  {
    taskKey: 'published_article_crawler_audit',
    name: 'Published article crawler audit',
    description: 'Daily audit of crawler frequency for published articles; safely refreshes weak descriptions and resubmits cold URLs.',
    cronExpr: '0 10 * * *',
    enabled: true,
  },
  {
    taskKey: 'auto_fill_articles',
    name: '自動補齊品牌文章',
    description: 'Legacy GEO 模板補文。預設停用；需 LEGACY_GEO_BULK_ENABLED=1 並手動啟用排程才會執行',
    cronExpr: '30 6 * * *',
    enabled: false,
  },
  {
    taskKey: 'client_daily_content',
    name: '付費客戶方案配額代發內容',
    description: '每日 08:00 UTC 檢查 isClient 站點，依訂閱方案週配額生成當日 client_daily 文章（週日休）。改為 CronManager 驅動以支援 process restart 後的 missed-run catchup',
    cronExpr: '0 8 * * *',
    enabled: true,
  },
  {
    taskKey: 'client_daily_sentinel',
    name: '付費客戶內容生成監控哨兵',
    description: '每日 09:00 UTC（client_daily 跑完後一小時）檢查當天該有的 client_daily 文章是否都已產出；少於預期就 logger.error 留下警告。週日休',
    cronExpr: '0 9 * * 1-6',
    enabled: true,
  },
];

const FORCE_ENABLED_TASKS = new Set([
  'auto_rescan',
  'indexnow_batch_submit',
  'directory_seo_recovery',
  'auto_fill_qa',
  'client_daily_content',
  'client_daily_sentinel',
  'ai_platform_official_monitor',
  'published_article_crawler_audit',
]);

@Injectable()
export class CronManagerService implements OnModuleInit {
  private readonly logger = new Logger(CronManagerService.name);
  private handlers = new Map<string, TaskHandler>();
  private isChecking = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.LOCAL_OFFLINE_MODE === '1') {
      this.logger.warn('LOCAL_OFFLINE_MODE=1: skipping scheduler DB seed');
      return;
    }
    await this.seedDefaultTasks();
    this.logger.log('CronManager initialized — checking tasks every 60s');
  }

  /** Register a task handler from other modules */
  registerHandler(taskKey: string, handler: TaskHandler) {
    this.handlers.set(taskKey, handler);
    this.logger.log(`Registered handler: ${taskKey}`);
  }

  /** Run one registered task immediately, regardless of its cron due time. */
  async runTaskNow(taskKey: string) {
    const handler = this.handlers.get(taskKey);
    if (!handler) {
      throw new NotFoundException(`No handler registered for scheduled task: ${taskKey}`);
    }

    const task = await this.prisma.scheduledTask.findUnique({ where: { taskKey } });
    if (!task) {
      throw new NotFoundException(`Scheduled task not found: ${taskKey}`);
    }

    const now = new Date();
    this.logger.log(`Manually running task: ${task.name} (${task.taskKey})`);

    try {
      await handler();
      const nextRun = this.getNextRun(task.cronExpr);
      return this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: now,
          lastResult: 'success',
          nextRunAt: nextRun,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Manual task ${task.taskKey} failed: ${errMsg}`);
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: now,
          lastResult: `error: ${errMsg.slice(0, 200)}`,
          nextRunAt: this.getNextRun(task.cronExpr),
        },
      });
      throw new BadRequestException(`Task ${taskKey} failed: ${errMsg}`);
    }
  }

  /** Every 60 seconds, check which tasks are due */
  @Interval(60_000)
  async checkAndRunTasks() {
    if (process.env.LOCAL_OFFLINE_MODE === '1') return;
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const tasks = await this.prisma.scheduledTask.findMany({
        where: { enabled: true },
      });

      const now = new Date();

      for (const task of tasks) {
        if (!this.handlers.has(task.taskKey)) continue;

        const isDue = this.isTaskDue(task.cronExpr, task.lastRunAt, now);
        if (!isDue) continue;

        const handler = this.handlers.get(task.taskKey)!;
        this.logger.log(`Running task: ${task.name} (${task.taskKey})`);

        try {
          await handler();

          const nextRun = this.getNextRun(task.cronExpr);
          await this.prisma.scheduledTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              lastResult: 'success',
              nextRunAt: nextRun,
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Task ${task.taskKey} failed: ${errMsg}`);
          await this.prisma.scheduledTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              lastResult: `error: ${errMsg.slice(0, 200)}`,
              nextRunAt: this.getNextRun(task.cronExpr),
            },
          });
        }
      }
    } finally {
      this.isChecking = false;
    }
  }

  /** Check if a task is due based on cron expression and last run */
  private isTaskDue(cronExpr: string, lastRunAt: Date | null, now: Date): boolean {
    try {
      const interval = cronParser.parseExpression(cronExpr, { currentDate: now });
      const prevRun = interval.prev().toDate();

      // If never run, or last run was before the most recent scheduled time
      if (!lastRunAt) return true;
      return lastRunAt.getTime() < prevRun.getTime();
    } catch {
      return false;
    }
  }

  private getNextRun(cronExpr: string): Date | null {
    try {
      const interval = cronParser.parseExpression(cronExpr);
      return interval.next().toDate();
    } catch {
      return null;
    }
  }

  private async seedDefaultTasks() {
    for (const task of DEFAULT_TASKS) {
      await this.prisma.scheduledTask.upsert({
        where: { taskKey: task.taskKey },
        update: {
          name: task.name,
          description: task.description,
          cronExpr: task.cronExpr,
          ...(FORCE_ENABLED_TASKS.has(task.taskKey) ? { enabled: true } : {}),
          nextRunAt: this.getNextRun(task.cronExpr),
        },
        create: {
          ...task,
          nextRunAt: this.getNextRun(task.cronExpr),
        },
      });
    }
  }
}
