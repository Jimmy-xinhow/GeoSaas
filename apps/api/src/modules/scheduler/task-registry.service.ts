import { Injectable, OnModuleInit } from '@nestjs/common';
import { CronManagerService } from './cron-manager.service';
import { MonitorSchedulerService } from '../monitor/monitor-scheduler.service';
import { DirectoryService } from '../directory/directory.service';
import { BlogArticleService } from '../blog-article/blog-article.service';
import { IndustryInsightService } from '../blog-article/industry-insight.service';

@Injectable()
export class TaskRegistryService implements OnModuleInit {
  constructor(
    private readonly cronManager: CronManagerService,
    private readonly monitorScheduler: MonitorSchedulerService,
    private readonly directoryService: DirectoryService,
    private readonly blogArticleService: BlogArticleService,
    private readonly insightService: IndustryInsightService,
  ) {}

  onModuleInit() {
    // Register all task handlers
    this.cronManager.registerHandler('robots_check', async () => {
      // robots.txt check is handled by CrawlerSchedulerService directly
      // We just need it registered so the schedule is configurable
    });

    this.cronManager.registerHandler('tier_recalculation', async () => {
      await this.directoryService.recalculateTiers();
    });

    this.cronManager.registerHandler('blog_bulk_generation', async () => {
      await this.blogArticleService.scheduledBulkGeneration();
    });

    this.cronManager.registerHandler('monitor_daily_pro', async () => {
      await this.monitorScheduler.handleDailyProCheck();
    });

    this.cronManager.registerHandler('monitor_weekly_free', async () => {
      await this.monitorScheduler.handleWeeklyFreeCheck();
    });

    this.cronManager.registerHandler('weekly_industry_insights', async () => {
      await this.insightService.weeklyInsightGeneration();
    });

    this.cronManager.registerHandler('crawler_monthly_cleanup', async () => {
      // Handled by CrawlerSchedulerService directly
    });
  }
}
