import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';

/**
 * Crawler Boost — active discovery for cold client sites.
 *
 * Background: new / low-traffic client sites get 0 AI-crawler visits because
 * GPTBot/ClaudeBot/PerplexityBot only crawl URLs they already know. This
 * service closes the loop for paying clients:
 *
 *   1. Every day at 04:00 UTC, find isClient=true sites whose CrawlerVisit
 *      log has been silent for >=14 days (or is empty outright).
 *   2. For each cold site, fire:
 *        - IndexNow submitUrl(siteUrl)                       [Bing/Yandex]
 *        - IndexNow submitUrl(/directory/{siteId})           [Geovault page]
 *        - IndexNow submitUrl(/blog/{brand_showcase slug})   [if exists]
 *        - WebSub publish on the per-brand /feed + /feed.json
 *   3. Log the boost attempt via the logger so operators can see it in
 *      Railway logs. (No DB table — this runs daily, log is enough.)
 *
 * Cost: 0 LLM. Each ping is a GET/POST to public IndexNow + WebSub
 * endpoints. Full run ~5 clients × 5 endpoints = 25 pings.
 *
 * Admin can trigger manually via POST /admin/crawler/boost (see
 * CrawlerTrackingController).
 */
@Injectable()
export class CrawlerBoostService {
  private readonly logger = new Logger(CrawlerBoostService.name);
  private readonly webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexNow: IndexNowService,
  ) {}

  /**
   * Daily cron: 04:00 UTC ≈ 12:00 Taiwan time. Runs after scan-weekly-refresh
   * (Sunday 02:00) and brand-showcase-daily (05:00 UTC = 13:00 TW), so the
   * discovery graph the crawler lands on is the freshest possible state.
   */
  @Cron('0 4 * * *', { name: 'crawler-boost-daily' })
  async scheduledCrawlerBoost(): Promise<void> {
    await this.boostColdClients();
  }

  /**
   * Find cold client sites and fire discovery pings. Returns per-site
   * outcomes so the caller (admin manual trigger) can see what happened.
   */
  async boostColdClients(): Promise<{
    scanned: number;
    cold: number;
    boosted: number;
    perSite: Array<{
      siteId: string;
      name: string;
      url: string;
      lastVisit: string | null;
      pingsFired: number;
    }>;
  }> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    const clients = await this.prisma.site.findMany({
      where: { isClient: true, isPublic: true },
      select: {
        id: true,
        name: true,
        url: true,
        crawlerVisits: {
          where: { isSeeded: false, visitedAt: { gte: fourteenDaysAgo } },
          select: { visitedAt: true },
          orderBy: { visitedAt: 'desc' },
          take: 1,
        },
        blogArticles: {
          where: { templateType: 'brand_showcase', published: true },
          select: { slug: true },
          take: 1,
        },
      },
    });

    // Cold = zero real bot visits in last 14 days. `crawlerVisits` will be
    // empty because we filtered by the window already.
    const cold = clients.filter((c) => c.crawlerVisits.length === 0);

    if (cold.length === 0) {
      this.logger.log(
        `crawler-boost: ${clients.length} clients scanned, none are cold`,
      );
      return { scanned: clients.length, cold: 0, boosted: 0, perSite: [] };
    }

    this.logger.log(
      `crawler-boost: ${clients.length} scanned, ${cold.length} cold — firing pings`,
    );

    const queue = pLimit(3); // small parallelism so we don't hammer IndexNow
    const perSite: Array<{
      siteId: string;
      name: string;
      url: string;
      lastVisit: string | null;
      pingsFired: number;
    }> = [];

    await Promise.all(
      cold.map((site) =>
        queue(async () => {
          const urls: string[] = [
            site.url, // the client's own homepage
            `${this.webUrl}/directory/${site.id}`, // Geovault directory page
          ];
          const showcaseSlug = site.blogArticles[0]?.slug;
          if (showcaseSlug) {
            urls.push(`${this.webUrl}/blog/${showcaseSlug}`);
          }

          // Fire IndexNow for every URL (Bing / Yandex / api.indexnow.org)
          for (const url of urls) {
            this.indexNow.submitUrl(url).catch((err) => {
              this.logger.warn(`indexnow ${url}: ${err?.message ?? err}`);
            });
          }

          // WebSub — tell the hub the per-brand feeds have updates worth
          // re-pulling. Feeds list the brand's scan / QA / badge timeline.
          const feedUrls = [
            `${this.webUrl}/directory/${site.id}/feed`,
            `${this.webUrl}/directory/${site.id}/feed.json`,
          ];
          this.indexNow.notifyWebSubHub(feedUrls).catch((err) => {
            this.logger.warn(`websub ${site.name}: ${err?.message ?? err}`);
          });

          perSite.push({
            siteId: site.id,
            name: site.name,
            url: site.url,
            lastVisit: null, // zero in window; we flagged cold because of this
            pingsFired: urls.length + feedUrls.length,
          });

          this.logger.log(
            `boosted ${site.name}: ${urls.length} indexnow + ${feedUrls.length} websub`,
          );
        }),
      ),
    );

    return {
      scanned: clients.length,
      cold: cold.length,
      boosted: perSite.length,
      perSite,
    };
  }
}
