import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from './indexnow.service';
import { publicIndexableBlogArticleWhere, publicSiteWhere } from '../../common/utils/public-data-filter';

/**
 * Proactively push eligible Geovault URLs to IndexNow and Bing URL Submission.
 *
 * - Bing URL Submission API: batch submit up to 10,000 URLs/day
 * - Runs daily at 05:00 UTC (13:00 TW) — pushes recently updated content
 */
@Injectable()
export class SearchEnginePushService {
  private readonly logger = new Logger(SearchEnginePushService.name);
  private readonly webUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly indexNow: IndexNowService,
  ) {
    this.webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
  }

  /** Collect URLs that were updated in the last 24 hours */
  private async getRecentUrls(): Promise<string[]> {
    const since = new Date(Date.now() - 86400000);
    const urls: string[] = [];

    // Recently scanned sites
    const scannedSites = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        scans: { some: { status: 'COMPLETED', completedAt: { gte: since } } },
      }),
      select: { id: true },
      take: 100,
    });
    scannedSites.forEach((s) => urls.push(`${this.webUrl}/directory/${s.id}`));

    // Recently published articles
    const articles = await this.prisma.blogArticle.findMany({
      where: publicIndexableBlogArticleWhere({ published: true, createdAt: { gte: since } }),
      select: { slug: true },
      take: 100,
    });
    articles.forEach((a) => urls.push(`${this.webUrl}/blog/${a.slug}`));

    // Priority: client sites always included
    const clientSites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isClient: true, isPublic: true }),
      select: { id: true },
    });
    clientSites.forEach((s) => {
      const url = `${this.webUrl}/directory/${s.id}`;
      if (!urls.includes(url)) urls.push(url);
    });

    // Static pages (always push)
    urls.push(
      this.webUrl,
      `${this.webUrl}/directory`,
      `${this.webUrl}/blog`,
      `${this.webUrl}/cases`,
      `${this.webUrl}/guide`,
      `${this.webUrl}/news`,
    );

    return [...new Set(urls)];
  }

  /**
   * Google Indexing API — notify Google about updated URLs.
   * General directory/blog URLs are not eligible for Google's Indexing API.
   * They are discovered through sitemap.xml and Search Console instead.
   */
  private async pushToGoogle(): Promise<{ submitted: 0; skipped: string }> {
    const skipped = 'unsupported_for_general_pages';
    this.logger.log(`Google Indexing API skipped: ${skipped}`);
    return { submitted: 0, skipped };
  }

  /**
   * Bing URL Submission API — batch submit URLs.
   * Requires BING_WEBMASTER_API_KEY.
   * Separate from IndexNow — this is the direct Bing Webmaster API.
   */
  private async pushToBing(urls: string[]): Promise<{ submitted: number; error?: string }> {
    const apiKey = this.config.get('BING_WEBMASTER_API_KEY');

    if (!apiKey) {
      this.logger.log('BING_WEBMASTER_API_KEY not set, skipping Bing URL Submission API');
      return { submitted: 0 };
    }

    try {
      const siteUrl = this.webUrl;
      const res = await fetch(
        `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl, urlList: urls.slice(0, 500) }),
        },
      );

      if (res.ok) {
        this.logger.log(`Bing URL Submission: ${urls.length} URLs submitted`);
        return { submitted: urls.length };
      }

      const body = await res.text();
      this.logger.warn(`Bing URL Submission error: ${res.status} ${body.slice(0, 200)}`);
      return { submitted: 0, error: `HTTP ${res.status}` };
    } catch (err: any) {
      this.logger.warn(`Bing URL Submission failed: ${err.message}`);
      return { submitted: 0, error: err.message };
    }
  }

  /** Cron: daily at 13:00 TW (05:00 UTC) — push recent URLs to all engines */
  @Cron('0 5 * * *', { name: 'search-engine-push' })
  async scheduledPush() {
    this.logger.log('Starting daily search engine URL push...');

    const urls = await this.getRecentUrls();
    this.logger.log(`Collected ${urls.length} URLs to push`);

    // 1. IndexNow (Bing + Yandex + IndexNow partners)
    try {
      await this.indexNow.submitBatch(urls, new URL(this.webUrl).host);
    } catch (err: any) {
      this.logger.warn(`IndexNow batch failed: ${err.message}`);
    }

    // 2. Record that general pages are intentionally excluded from Google's
    // restricted Indexing API.
    await this.pushToGoogle();

    // 3. Bing URL Submission API
    await this.pushToBing(urls);

    this.logger.log('Daily search engine push complete');
  }

  /** Manual trigger */
  async manualPush(): Promise<{ urls: number; indexNow: any; google: any; bing: any }> {
    const urls = await this.getRecentUrls();

    const indexNowResult = await this.indexNow.submitBatch(urls.slice(0, 50), new URL(this.webUrl).host);
    const googleResult = await this.pushToGoogle();
    const bingResult = await this.pushToBing(urls.slice(0, 50));

    return { urls: urls.length, indexNow: indexNowResult, google: googleResult, bing: bingResult };
  }
}
