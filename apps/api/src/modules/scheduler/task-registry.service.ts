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
        take: 30, // 30 sites per run — target: all brands in 1 month
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
        .slice(0, 30); // 30 sites per run — target: all brands in 1 month

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

    // --- Paid client daily content (Mon-Sat) ---
    // Moved from @Cron decorator to DB-driven scheduling so process restart
    // doesn't drop the day. CronManager.isTaskDue() will catch up any single
    // missed run on the next 60s tick.
    this.cronManager.registerHandler('client_daily_content', async () => {
      const r = await this.blogArticleService.runClientDailyBatch();
      this.logger.log(
        `client_daily batch: attempted=${r.attempted} generated=${r.generated} rejected=${r.rejected} skipped=${r.skipped}`,
      );
    });

    // --- Sentinel: verify today's client_daily articles actually landed ---
    // Runs 1h after the batch (09:00 UTC). Loud ERROR log when expected articles
    // are missing — gives us a signal in Railway log when prod silently breaks
    // (which is exactly what happened 4/28-4/30 with the @Cron version).
    this.cronManager.registerHandler('client_daily_sentinel', async () => {
      const dayMap = ['', 'mon_topical', 'tue_qa_deepdive', 'wed_service', 'thu_audience', 'fri_comparison', 'sat_data_pulse'];
      const today = new Date();
      const dow = today.getUTCDay(); // 0=Sun
      if (dow === 0) return; // Sunday off
      const dayType = dayMap[dow];

      const planActiveDays: Record<string, string[]> = {
        PRO: ['mon_topical', 'tue_qa_deepdive', 'wed_service', 'thu_audience', 'fri_comparison', 'sat_data_pulse'],
        STARTER: ['tue_qa_deepdive', 'fri_comparison'],
      };

      const clients = await this.prisma.site.findMany({
        where: { isClient: true, isPublic: true },
        select: { id: true, name: true, profile: true, user: { select: { plan: true, role: true } } },
      });

      const expected: Array<{ id: string; name: string }> = [];
      for (const s of clients) {
        const profile = (s.profile as Record<string, any>) || {};
        if (profile.dailyContentPaused) continue;
        const role = s.user?.role;
        const isBypass = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'STAFF';
        const allowedDays = isBypass
          ? planActiveDays.PRO
          : planActiveDays[s.user?.plan || 'FREE'] || [];
        if (allowedDays.includes(dayType)) {
          expected.push({ id: s.id, name: s.name });
        }
      }

      const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
      const articles = await this.prisma.blogArticle.findMany({
        where: {
          siteId: { in: expected.map((e) => e.id) },
          templateType: 'client_daily',
          createdAt: { gte: todayStart },
          targetKeywords: { has: dayType },
        },
        select: { siteId: true },
      });
      const got = new Set(articles.map((a) => a.siteId));
      const missing = expected.filter((e) => !got.has(e.id));

      if (missing.length === 0) {
        this.logger.log(`client_daily sentinel OK: ${expected.length}/${expected.length} ${dayType}`);
        return;
      }

      this.logger.error(
        `client_daily sentinel ALERT: ${missing.length}/${expected.length} ${dayType} 篇遺漏 — sites: ${missing.map((m) => m.name).join(', ')}`,
      );
    });
  }
}
