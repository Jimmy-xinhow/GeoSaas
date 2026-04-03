import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronManagerService } from './cron-manager.service';
import { MonitorSchedulerService } from '../monitor/monitor-scheduler.service';
import { DirectoryService } from '../directory/directory.service';
import { BlogArticleService } from '../blog-article/blog-article.service';
import { IndustryInsightService } from '../blog-article/industry-insight.service';
import { SeedService } from '../seed/seed.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

@Injectable()
export class TaskRegistryService implements OnModuleInit {
  private readonly logger = new Logger(TaskRegistryService.name);

  constructor(
    private readonly cronManager: CronManagerService,
    private readonly monitorScheduler: MonitorSchedulerService,
    private readonly directoryService: DirectoryService,
    private readonly blogArticleService: BlogArticleService,
    private readonly insightService: IndustryInsightService,
    private readonly seedService: SeedService,
    private readonly indexNowService: IndexNowService,
    private readonly prisma: PrismaService,
    private readonly scanPipeline: ScanPipelineService,
    private readonly discoveryService: DiscoveryService,
    private readonly knowledgeService: KnowledgeService,
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

    // --- New tasks ---

    this.cronManager.registerHandler('auto_rescan', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sites = await this.prisma.site.findMany({
        where: {
          isPublic: true,
          bestScore: { gt: 0 },
          OR: [
            { bestScoreAt: { lt: thirtyDaysAgo } },
            { bestScoreAt: null },
          ],
        },
        select: { id: true, url: true },
        take: 20,
      });

      this.logger.log(`Auto-rescan: ${sites.length} sites due for rescan`);

      for (const site of sites) {
        try {
          const scan = await this.prisma.scan.create({
            data: { siteId: site.id, status: 'PENDING' },
          });
          await this.scanPipeline.executeScan(scan.id, site.url);
        } catch (err) {
          this.logger.warn(`Auto-rescan failed for ${site.url}: ${err}`);
        }
      }
    });

    this.cronManager.registerHandler('indexnow_batch_submit', async () => {
      const sites = await this.prisma.site.findMany({
        where: { isPublic: true, bestScore: { gt: 0 } },
        select: { id: true, url: true },
      });

      const webUrl = process.env.FRONTEND_URL || 'https://www.geovault.app';
      const urls = [
        webUrl,
        `${webUrl}/directory`,
        `${webUrl}/blog`,
        `${webUrl}/llms.txt`,
        `${webUrl}/sitemap.xml`,
        ...sites.slice(0, 90).map(s => `${webUrl}/directory/${s.id}`),
      ];

      await this.indexNowService.submitBatch(urls, new URL(webUrl).host);
      this.logger.log(`IndexNow batch: submitted ${urls.length} URLs`);
    });

    this.cronManager.registerHandler('retry_failed_seeds', async () => {
      const result = await this.seedService.retryFailed();
      this.logger.log(`Retry failed seeds: reset ${result.reset} to pending`);
      if (result.reset > 0) {
        await this.seedService.runScanning();
      }
    });

    this.cronManager.registerHandler('auto_discover_businesses', async () => {
      const result = await this.discoveryService.discoverBusinesses();
      this.logger.log(`Auto-discovery: ${result.discovered} found, ${result.scanned} scanned`);
    });

    this.cronManager.registerHandler('enrich_industry_content', async () => {
      const result = await this.discoveryService.enrichIndustryContent();
      this.logger.log(`Content enrichment: ${result.created} Q&A created`);
    });

    // --- Depth: Auto-fill Q&A for brands without knowledge base ---
    this.cronManager.registerHandler('auto_fill_qa', async () => {
      // Find public sites that have been scanned but have NO Q&A
      const sitesWithoutQA = await this.prisma.site.findMany({
        where: {
          isPublic: true,
          bestScore: { gt: 0 },
          qas: { none: {} },
        },
        select: { id: true, name: true, url: true },
        take: 10, // 10 sites per run
      });

      this.logger.log(`Auto-fill Q&A: ${sitesWithoutQA.length} sites without knowledge base`);

      for (const site of sitesWithoutQA) {
        try {
          // Use the site owner's userId for the knowledge generation
          const siteWithUser = await this.prisma.site.findUnique({ where: { id: site.id }, select: { userId: true } });
          if (siteWithUser) {
            await this.knowledgeService.aiGenerate(site.id, siteWithUser.userId);
          }
          this.logger.log(`Auto-fill Q&A: generated for ${site.name}`);
          await new Promise((r) => setTimeout(r, 3000)); // rate limit
        } catch (err) {
          this.logger.warn(`Auto-fill Q&A failed for ${site.name}: ${err}`);
        }
      }
    });

    // --- Depth: Auto-fill articles for brands with < 3 articles ---
    this.cronManager.registerHandler('auto_fill_articles', async () => {
      const sites = await this.prisma.site.findMany({
        where: {
          isPublic: true,
          bestScore: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          _count: { select: { blogArticles: true } },
        },
      });

      const needArticles = sites
        .filter((s) => s._count.blogArticles < 3)
        .slice(0, 10); // 10 sites per run

      this.logger.log(`Auto-fill articles: ${needArticles.length} sites need more articles`);

      for (const site of needArticles) {
        try {
          await this.blogArticleService.generateArticlesForSite(site.id);
          this.logger.log(`Auto-fill articles: generated for ${site.name}`);
          await new Promise((r) => setTimeout(r, 3000));
        } catch (err) {
          this.logger.warn(`Auto-fill articles failed for ${site.name}: ${err}`);
        }
      }
    });
  }
}
