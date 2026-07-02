import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import {
  getPublicBlogArticleSeoIssues,
  publicIndexableBlogArticleWhere,
} from '../../common/utils/public-data-filter';

type OfficialSourceSeed = {
  platform: string;
  title: string;
  url: string;
  sourceType: string;
};

type ExtractedOfficialPage = {
  title: string;
  text: string;
  hash: string;
};

type CrawlerAuditArticle = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string;
  templateType: string;
  createdAt: Date;
  site: { name: string | null; url: string | null; isPublic: boolean | null } | null;
};

const OFFICIAL_SOURCES: OfficialSourceSeed[] = [
  {
    platform: 'openai',
    title: 'OpenAI crawlers and user agents',
    url: 'https://developers.openai.com/api/docs/bots',
    sourceType: 'crawler_guidance',
  },
  {
    platform: 'anthropic',
    title: 'Anthropic crawler and Claude user agents',
    url: 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
    sourceType: 'crawler_guidance',
  },
  {
    platform: 'perplexity',
    title: 'Perplexity crawlers',
    url: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers',
    sourceType: 'crawler_guidance',
  },
  {
    platform: 'google',
    title: 'Google Search AI features guidance',
    url: 'https://developers.google.com/search/docs/appearance/ai-features',
    sourceType: 'ai_search_guidance',
  },
  {
    platform: 'bing',
    title: 'Bing Webmaster official updates',
    url: 'https://blogs.bing.com/webmaster/',
    sourceType: 'ai_search_guidance',
  },
];

@Injectable()
export class AiPlatformIntelligenceService {
  private readonly logger = new Logger(AiPlatformIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexNow: IndexNowService,
  ) {}

  async runWeeklyOfficialMonitor() {
    await this.seedOfficialSources();

    const sources = await this.prisma.aiPlatformOfficialSource.findMany({
      where: { enabled: true },
      orderBy: [{ platform: 'asc' }, { url: 'asc' }],
    });

    const result = {
      checked: 0,
      changed: 0,
      unchanged: 0,
      failed: 0,
      appliedFixes: [] as string[],
    };

    for (const source of sources) {
      result.checked++;
      try {
        const page = await this.fetchOfficialPage(source.url);
        const changed = source.lastHash !== page.hash;
        const actionItems = this.buildActionItems(source.platform, page.text);
        const summary = this.buildGuidanceSummary(source.platform, page.text, actionItems);
        const appliedFixes = changed
          ? await this.applyOfficialGuidanceFixes({
              platform: source.platform,
              title: page.title || source.title,
              url: source.url,
              summary,
              actionItems,
            })
          : [];

        if (changed) {
          await this.prisma.aiPlatformOfficialSnapshot.upsert({
            where: {
              sourceId_hash: {
                sourceId: source.id,
                hash: page.hash,
              },
            },
            update: {
              title: page.title || source.title,
              summary,
              rawText: page.text.slice(0, 20000),
              actionItems,
              appliedFixes,
            },
            create: {
              sourceId: source.id,
              platform: source.platform,
              hash: page.hash,
              title: page.title || source.title,
              summary,
              rawText: page.text.slice(0, 20000),
              actionItems,
              appliedFixes,
            },
          });
          result.changed++;
          result.appliedFixes.push(...appliedFixes);
        } else {
          result.unchanged++;
        }

        await this.prisma.aiPlatformOfficialSource.update({
          where: { id: source.id },
          data: {
            title: page.title || source.title,
            lastHash: page.hash,
            lastFetchedAt: new Date(),
            lastChangedAt: changed ? new Date() : source.lastChangedAt,
            lastStatus: changed ? 'changed' : 'unchanged',
            lastError: null,
          },
        });
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.aiPlatformOfficialSource.update({
          where: { id: source.id },
          data: {
            lastFetchedAt: new Date(),
            lastStatus: 'error',
            lastError: message.slice(0, 2000),
          },
        });
        this.logger.warn(`AI platform official monitor failed for ${source.url}: ${message}`);
      }
    }

    this.logger.log(
      `AI platform official monitor: checked=${result.checked} changed=${result.changed} unchanged=${result.unchanged} failed=${result.failed}`,
    );
    return result;
  }

  async runPublishedArticleCrawlerAudit(options: { limit?: number; apply?: boolean } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000);
    const apply = options.apply !== false;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const minimumAge = new Date(now.getTime() - 48 * 3600000);
    const webUrl = this.getWebUrl();

    const articles = await this.prisma.blogArticle.findMany({
      where: publicIndexableBlogArticleWhere({ published: true }),
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        content: true,
        templateType: true,
        createdAt: true,
        site: { select: { name: true, url: true, isPublic: true } },
      },
    });

    const slugSet = new Set(articles.map((article) => article.slug));
    const crawlerVisits = await this.prisma.crawlerVisit.findMany({
      where: {
        isSeeded: false,
        visitedAt: { gte: thirtyDaysAgo },
        OR: [
          { url: { contains: 'geovault.app/blog/' } },
          { url: { contains: 'www.geovault.app/blog/' } },
        ],
      },
      orderBy: { visitedAt: 'desc' },
      select: { url: true, visitedAt: true },
    });

    const stats = new Map<string, { last24h: number; last7d: number; last30d: number; lastVisitAt: Date | null }>();
    for (const article of articles) {
      stats.set(article.slug, { last24h: 0, last7d: 0, last30d: 0, lastVisitAt: null });
    }

    for (const visit of crawlerVisits) {
      const slug = this.extractBlogSlugFromUrl(visit.url);
      if (!slug || !slugSet.has(slug)) continue;
      const row = stats.get(slug);
      if (!row) continue;
      row.last30d++;
      if (visit.visitedAt >= sevenDaysAgo) row.last7d++;
      if (visit.visitedAt >= oneDayAgo) row.last24h++;
      if (!row.lastVisitAt || visit.visitedAt > row.lastVisitAt) row.lastVisitAt = visit.visitedAt;
    }

    const urlsToSubmit: string[] = [];
    let audited = 0;
    let withIssues = 0;
    let fixedDescriptions = 0;
    const issueCounts: Record<string, number> = {};
    const fixCounts: Record<string, number> = {};

    for (const article of articles as CrawlerAuditArticle[]) {
      audited++;
      const row = stats.get(article.slug) ?? { last24h: 0, last7d: 0, last30d: 0, lastVisitAt: null };
      const seoIssues = getPublicBlogArticleSeoIssues(article);
      const issues = [...seoIssues];
      const fixes: string[] = [];

      if (article.createdAt <= minimumAge && row.last7d === 0) issues.push('no-crawler-7d');
      if (article.createdAt <= thirtyDaysAgo && row.last30d === 0) issues.push('no-crawler-30d');
      if (this.visibleTextLength(article.content) < 800) issues.push('thin-content');

      if (apply && issues.includes('thin-description')) {
        const description = this.buildDescriptionFromArticle(article);
        if (description && description !== article.description) {
          await this.prisma.blogArticle.update({
            where: { id: article.id },
            data: {
              description,
              lastRegeneratedAt: now,
            },
          });
          fixes.push('description-refreshed');
          fixedDescriptions++;
        }
      }

      if (apply && (issues.includes('no-crawler-7d') || issues.includes('no-crawler-30d'))) {
        urlsToSubmit.push(`${webUrl}/blog/${encodeURIComponent(article.slug)}`);
        fixes.push('indexnow-resubmitted');
      }

      if (issues.length > 0 || fixes.length > 0) {
        withIssues++;
        issues.forEach((issue) => {
          issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
        });
        fixes.forEach((fix) => {
          fixCounts[fix] = (fixCounts[fix] ?? 0) + 1;
        });

        await this.prisma.publishedArticleCrawlerAudit.create({
          data: {
            articleId: article.id,
            slug: article.slug,
            templateType: article.templateType,
            publishedAt: article.createdAt,
            last24h: row.last24h,
            last7d: row.last7d,
            last30d: row.last30d,
            lastVisitAt: row.lastVisitAt,
            status: fixes.length > 0 ? 'fixed' : 'needs_review',
            issues,
            fixes,
          },
        });
      }
    }

    const submittedUrls = [...new Set(urlsToSubmit)].slice(0, 250);
    if (apply && submittedUrls.length > 0) {
      await this.indexNow.submitBatch(submittedUrls, new URL(webUrl).host);
    }

    const result = {
      audited,
      withIssues,
      fixedDescriptions,
      submittedUrls: submittedUrls.length,
      issueCounts,
      fixCounts,
    };

    this.logger.log(
      `Published article crawler audit: audited=${audited} withIssues=${withIssues} descriptions=${fixedDescriptions} indexnow=${submittedUrls.length}`,
    );
    return result;
  }

  private async seedOfficialSources() {
    for (const source of OFFICIAL_SOURCES) {
      await this.prisma.aiPlatformOfficialSource.upsert({
        where: { url: source.url },
        update: {
          platform: source.platform,
          sourceType: source.sourceType,
          title: source.title,
          enabled: true,
        },
        create: {
          platform: source.platform,
          sourceType: source.sourceType,
          title: source.title,
          url: source.url,
          enabled: true,
        },
      });
    }
  }

  private async fetchOfficialPage(url: string): Promise<ExtractedOfficialPage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Geovault-OfficialGuidanceMonitor/1.0 (+https://www.geovault.app)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      return this.extractOfficialPage(html);
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractOfficialPage(html: string): ExtractedOfficialPage {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, nav, footer, header').remove();
    const title = this.normalizeText(
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text() ||
      $('h1').first().text(),
    );
    const text = this.normalizeText(
      $('main').text() ||
      $('article').text() ||
      $('[role="main"]').text() ||
      $('body').text(),
    );
    if (text.length < 200) {
      throw new Error('Official page text was too short to monitor reliably');
    }
    const canonical = `${title}\n${text}`;
    return {
      title,
      text,
      hash: createHash('sha256').update(canonical).digest('hex'),
    };
  }

  private buildActionItems(platform: string, text: string): string[] {
    const lower = text.toLowerCase();
    const items: string[] = [];

    if (lower.includes('robots.txt') || lower.includes('robotstxt')) {
      items.push('robots-txt-allowlist-review');
    }
    if (lower.includes('sitemap') || lower.includes('indexnow')) {
      items.push('sitemap-indexnow-refresh');
    }
    if (lower.includes('structured data') || lower.includes('schema')) {
      items.push('structured-data-visible-content-check');
    }
    if (lower.includes('snippet') || lower.includes('nosnippet')) {
      items.push('snippet-control-review');
    }
    if (lower.includes('ip range') || lower.includes('verify') || lower.includes('waf')) {
      items.push('crawler-ip-verification-review');
    }

    const platformDefaults: Record<string, string[]> = {
      openai: ['verify-oai-searchbot-gptbot-chatgpt-user-access'],
      anthropic: ['verify-claudebot-claude-searchbot-claude-user-access'],
      perplexity: ['verify-perplexitybot-perplexity-user-access'],
      google: ['verify-googlebot-indexability-and-ai-feature-eligibility'],
      bing: ['verify-bingbot-indexnow-and-ai-performance-signals'],
    };

    return [...new Set([...(platformDefaults[platform] ?? []), ...items])];
  }

  private buildGuidanceSummary(platform: string, text: string, actionItems: string[]) {
    const importantSentences = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((line) => line.trim())
      .filter((line) => {
        const lower = line.toLowerCase();
        return (
          lower.includes('crawler') ||
          lower.includes('robots') ||
          lower.includes('sitemap') ||
          lower.includes('structured data') ||
          lower.includes('snippet') ||
          lower.includes('indexnow') ||
          lower.includes('ai overview') ||
          lower.includes('ai mode') ||
          lower.includes('chatgpt') ||
          lower.includes('claude') ||
          lower.includes('perplexity') ||
          lower.includes('bing')
        );
      })
      .slice(0, 8);

    return [
      `Platform: ${platform}`,
      `Detected action items: ${actionItems.join(', ')}`,
      '',
      ...importantSentences,
    ].join('\n').slice(0, 5000);
  }

  private async applyOfficialGuidanceFixes(args: {
    platform: string;
    title: string;
    url: string;
    summary: string;
    actionItems: string[];
  }) {
    const fixes: string[] = [];
    const existing = await this.prisma.supportKnowledgeItem.findFirst({
      where: {
        category: 'ai-platform-intelligence',
        tags: { has: `platform:${args.platform}` },
      },
      select: { id: true },
    });
    const answer = [
      `Official source: ${args.url}`,
      '',
      args.summary,
      '',
      `Operational checklist: ${args.actionItems.join(', ')}`,
    ].join('\n');

    if (existing) {
      await this.prisma.supportKnowledgeItem.update({
        where: { id: existing.id },
        data: {
          title: args.title,
          question: `What changed in ${args.platform} AI crawler/search guidance?`,
          answer,
          tags: ['ai-platform-intelligence', `platform:${args.platform}`, ...args.actionItems],
          enabled: true,
          priority: 80,
        },
      });
      fixes.push('support-knowledge-updated');
    } else {
      await this.prisma.supportKnowledgeItem.create({
        data: {
          title: args.title,
          category: 'ai-platform-intelligence',
          question: `What changed in ${args.platform} AI crawler/search guidance?`,
          answer,
          tags: ['ai-platform-intelligence', `platform:${args.platform}`, ...args.actionItems],
          enabled: true,
          priority: 80,
        },
      });
      fixes.push('support-knowledge-created');
    }

    if (args.actionItems.includes('sitemap-indexnow-refresh')) {
      await this.submitCoreDiscoveryUrls();
      fixes.push('core-discovery-urls-resubmitted');
    }

    return fixes;
  }

  private async submitCoreDiscoveryUrls() {
    const webUrl = this.getWebUrl();
    await this.indexNow.submitBatch(
      [
        webUrl,
        `${webUrl}/blog`,
        `${webUrl}/directory`,
        `${webUrl}/sitemap.xml`,
        `${webUrl}/llms.txt`,
        `${webUrl}/api/llms-full.txt`,
      ],
      new URL(webUrl).host,
    );
  }

  private buildDescriptionFromArticle(article: CrawlerAuditArticle): string | null {
    const text = this.normalizeText(
      article.content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]*\)/g, ' ')
        .replace(/[#>*_`~|]/g, ' '),
    );
    const candidate =
      text
        .split(/(?<=[。！？.!?])\s*/)
        .map((line) => line.trim())
        .find((line) => line.length >= 90) ||
      text;
    const description = candidate.slice(0, 180).trim();
    if (description.length < 80) return null;
    if (!description.includes(article.title.slice(0, 6)) && article.title.length >= 10) {
      return `${article.title}：${description}`.slice(0, 180).trim();
    }
    return description;
  }

  private visibleTextLength(value: string) {
    return this.normalizeText(
      value
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]*\)/g, ' ')
        .replace(/[#>*_`~|]/g, ' '),
    ).length;
  }

  private extractBlogSlugFromUrl(value?: string | null): string | null {
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

  private getWebUrl() {
    return (process.env.FRONTEND_URL || process.env.WEB_URL || 'https://www.geovault.app').replace(/\/$/, '');
  }

  private normalizeText(value?: string | null) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }
}
