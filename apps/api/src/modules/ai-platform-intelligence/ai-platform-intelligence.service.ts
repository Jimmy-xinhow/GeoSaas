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

type PlatformContentLogic = {
  platform: string;
  officialDisclosureLevel: 'explicit' | 'partial' | 'limited';
  indexingLogic: string[];
  citationEligibility: string[];
  recommendedArticleStructure: string[];
  contentSignals: string[];
  antiPatterns: string[];
  measurementSignals: string[];
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
      enriched: 0,
      failed: 0,
      appliedFixes: [] as string[],
    };

    for (const source of sources) {
      result.checked++;
      try {
        const page = await this.fetchOfficialPage(source.url);
        const changed = source.lastHash !== page.hash;
        const actionItems = this.buildActionItems(source.platform, page.text);
        const contentLogic = this.buildPlatformContentLogic(source.platform, page.text, actionItems);
        const snapshotActionItems = { items: actionItems, contentLogic };
        const summary = this.buildGuidanceSummary(source.platform, page.text, actionItems, contentLogic);
        const appliedFixes = changed
          ? await this.applyOfficialGuidanceFixes({
              platform: source.platform,
              title: page.title || source.title,
              url: source.url,
              summary,
              actionItems,
              contentLogic,
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
              actionItems: snapshotActionItems,
              appliedFixes,
            },
            create: {
              sourceId: source.id,
              platform: source.platform,
              hash: page.hash,
              title: page.title || source.title,
              summary,
              rawText: page.text.slice(0, 20000),
              actionItems: snapshotActionItems,
              appliedFixes,
            },
          });
          result.changed++;
          result.appliedFixes.push(...appliedFixes);
        } else {
          const enriched = await this.enrichLatestSnapshotWithContentLogic({
            sourceId: source.id,
            platform: source.platform,
            hash: page.hash,
            title: page.title || source.title,
            summary,
            text: page.text,
            actionItems: snapshotActionItems,
          });
          if (enriched) result.enriched++;
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
      `AI platform official monitor: checked=${result.checked} changed=${result.changed} unchanged=${result.unchanged} enriched=${result.enriched} failed=${result.failed}`,
    );
    await this.refreshArticleGenerationGuidance({
      source: 'official-monitor',
      summary: `checked=${result.checked}; changed=${result.changed}; enriched=${result.enriched}; failed=${result.failed}`,
    });
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
    await this.refreshArticleGenerationGuidance({
      source: 'crawler-audit',
      summary: JSON.stringify(result),
    });
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
    await this.prisma.aiPlatformOfficialSource.updateMany({
      where: {
        url: 'https://help.openai.com/en/articles/9237897-chatgpt-search',
      },
      data: {
        enabled: false,
        lastStatus: 'disabled_unfetchable_in_production',
      },
    });
  }

  private async enrichLatestSnapshotWithContentLogic(args: {
    sourceId: string;
    platform: string;
    hash: string;
    title: string;
    summary: string;
    text: string;
    actionItems: { items: string[]; contentLogic: PlatformContentLogic };
  }) {
    const latest = await this.prisma.aiPlatformOfficialSnapshot.findFirst({
      where: { sourceId: args.sourceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, actionItems: true },
    });

    if (latest && this.getSnapshotContentLogic(latest.actionItems)) {
      return false;
    }

    if (latest) {
      await this.prisma.aiPlatformOfficialSnapshot.update({
        where: { id: latest.id },
        data: {
          title: args.title,
          summary: args.summary,
          rawText: args.text.slice(0, 20000),
          actionItems: args.actionItems,
        },
      });
      return true;
    }

    await this.prisma.aiPlatformOfficialSnapshot.create({
      data: {
        sourceId: args.sourceId,
        platform: args.platform,
        hash: args.hash,
        title: args.title,
        summary: args.summary,
        rawText: args.text.slice(0, 20000),
        actionItems: args.actionItems,
      },
    });
    return true;
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

  private buildGuidanceSummary(
    platform: string,
    text: string,
    actionItems: string[],
    contentLogic: PlatformContentLogic,
  ) {
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
      'Indexing logic:',
      ...contentLogic.indexingLogic.map((item) => `- ${item}`),
      'Citation eligibility:',
      ...contentLogic.citationEligibility.map((item) => `- ${item}`),
      'Recommended article structure:',
      ...contentLogic.recommendedArticleStructure.map((item) => `- ${item}`),
      'Content signals:',
      ...contentLogic.contentSignals.map((item) => `- ${item}`),
      '',
      ...importantSentences,
    ].join('\n').slice(0, 5000);
  }

  private buildPlatformContentLogic(
    platform: string,
    text: string,
    actionItems: string[],
  ): PlatformContentLogic {
    const lower = text.toLowerCase();
    const hasExplicitContentGuidance =
      lower.includes('helpful') ||
      lower.includes('people-first') ||
      lower.includes('structured data') ||
      lower.includes('snippet') ||
      lower.includes('duplicate content') ||
      lower.includes('sitemaps');

    const common: Omit<PlatformContentLogic, 'platform' | 'officialDisclosureLevel'> = {
      indexingLogic: [
        'Page must be reachable by the relevant platform crawler or user-triggered fetcher.',
        'Important content must be visible as text, not only inside images, scripts, or UI-only fragments.',
        'Canonical URL, sitemap/internal links, and stable metadata should make the page easy to discover and consolidate.',
      ],
      citationEligibility: [
        'The page should answer a concrete user question with specific, sourceable facts.',
        'The first section should identify the brand/entity, official URL, category, location or service scope, and data boundary.',
        'Claims should be visible on the page and match structured data or source lines when structured data is present.',
      ],
      recommendedArticleStructure: [
        'H1: brand/entity plus the exact search intent being answered.',
        'Opening answer: 2-3 sentences that can be quoted independently by an AI answer.',
        'Entity facts: official URL, industry/category, service scope, location or audience, and known limitations.',
        'Quote-ready bullets: 4-6 standalone factual bullets with no marketing language.',
        'FAQ: 3-5 natural user questions with concise answers and source references.',
        'Sources: official website, Geovault directory/AI Wiki page, and any verified first-party references.',
      ],
      contentSignals: [
        'Specific entity names, official domains, service names, location/audience terms, and exact user-question phrasing.',
        'Clear internal links from directory, blog, llms.txt/llms-full, and sitemap-discoverable URLs.',
        'Freshness signals through updatedAt/publishedAt, IndexNow where supported, and crawler visit monitoring.',
      ],
      antiPatterns: [
        'Generic industry essays that do not identify the specific brand/entity early.',
        'Duplicate or near-duplicate articles targeting the same question without new facts.',
        'Unsupported rankings, exaggerated recommendations, invented pricing, certifications, locations, reviews, or outcomes.',
      ],
      measurementSignals: [
        'CrawlerVisit rows by bot and URL over 24h/7d/30d.',
        'Search Console or Bing Webmaster data when available.',
        'Article-level no-crawler-7d/no-crawler-30d audit rows and citation/report mentions.',
      ],
    };

    if (platform === 'google') {
      return {
        ...common,
        platform,
        officialDisclosureLevel: 'explicit',
        indexingLogic: [
          'Google says AI Overviews/AI Mode use normal Google Search eligibility: indexed, snippet-eligible, and policy-compliant.',
          'Query fan-out can search across related subtopics and data sources, so pages should cover the entity plus adjacent user questions.',
          ...common.indexingLogic,
        ],
        citationEligibility: [
          'Use helpful, reliable, people-first content rather than a special AI-only markup strategy.',
          'Structured data must match visible text on the page.',
          ...common.citationEligibility,
        ],
      };
    }

    if (platform === 'bing') {
      return {
        ...common,
        platform,
        officialDisclosureLevel: hasExplicitContentGuidance ? 'partial' : 'limited',
        indexingLogic: [
          'Bing highlights sitemaps plus IndexNow as discovery and freshness signals for AI-powered search.',
          'Bing Webmaster AI Performance can measure URLs cited in Copilot/Bing AI-generated answers where available.',
          ...common.indexingLogic,
        ],
        citationEligibility: [
          'Avoid duplicate/canonical confusion because Bing says duplicate content can dilute signals for SEO and AI visibility.',
          'Use snippets intentionally; do not hide the factual answer blocks that AI systems need to cite.',
          ...common.citationEligibility,
        ],
      };
    }

    if (platform === 'openai') {
      return {
        ...common,
        platform,
        officialDisclosureLevel: 'limited',
        indexingLogic: [
          'OpenAI discloses OAI-SearchBot for ChatGPT search visibility and ChatGPT-User for user-triggered retrieval.',
          'OpenAI has not published a ranking formula for ChatGPT citations; treat content structure rules as conservative, source-grounded inference.',
          ...common.indexingLogic,
        ],
      };
    }

    if (platform === 'anthropic') {
      return {
        ...common,
        platform,
        officialDisclosureLevel: 'limited',
        indexingLogic: [
          'Anthropic discloses Claude-SearchBot for search quality and Claude-User for user-directed retrieval.',
          'Anthropic has not published a public citation ranking formula; optimize for accurate retrieval, factual answers, and crawler access.',
          ...common.indexingLogic,
        ],
      };
    }

    if (platform === 'perplexity') {
      return {
        ...common,
        platform,
        officialDisclosureLevel: 'partial',
        indexingLogic: [
          'PerplexityBot is designed to surface and link websites in Perplexity search results.',
          'Perplexity-User may fetch pages in response to a user question and include page links in answers.',
          ...common.indexingLogic,
        ],
        citationEligibility: [
          'Perplexity explicitly connects user-question fetching with accurate answers and page links, so use question-answer blocks that map to real queries.',
          ...common.citationEligibility,
        ],
      };
    }

    return {
      ...common,
      platform,
      officialDisclosureLevel: actionItems.length > 0 ? 'partial' : 'limited',
    };
  }

  private async applyOfficialGuidanceFixes(args: {
    platform: string;
    title: string;
    url: string;
    summary: string;
    actionItems: string[];
    contentLogic: PlatformContentLogic;
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
      'Content logic:',
      ...args.contentLogic.recommendedArticleStructure.map((item) => `- ${item}`),
      '',
      'Citation eligibility:',
      ...args.contentLogic.citationEligibility.map((item) => `- ${item}`),
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

  private async refreshArticleGenerationGuidance(args: { source: string; summary: string }) {
    const latestSnapshots = await this.prisma.aiPlatformOfficialSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        platform: true,
        title: true,
        actionItems: true,
        summary: true,
        createdAt: true,
      },
    });

    const recentAudits = await this.prisma.publishedArticleCrawlerAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        status: true,
        issues: true,
        fixes: true,
      },
    });

    const issueCounts: Record<string, number> = {};
    const fixCounts: Record<string, number> = {};
    for (const audit of recentAudits) {
      audit.issues.forEach((issue) => {
        issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
      });
      audit.fixes.forEach((fix) => {
        fixCounts[fix] = (fixCounts[fix] ?? 0) + 1;
      });
    }

    const officialActions = latestSnapshots
      .flatMap((snapshot) =>
        this.getSnapshotActionItems(snapshot.actionItems).map((item) => `${snapshot.platform}:${item}`),
      )
      .slice(0, 20);
    const platformLogicBlocks = latestSnapshots
      .map((snapshot) => this.getSnapshotContentLogic(snapshot.actionItems))
      .filter((logic): logic is PlatformContentLogic => Boolean(logic))
      .map((logic) => [
        `${logic.platform} (${logic.officialDisclosureLevel})`,
        `Indexing: ${logic.indexingLogic.slice(0, 2).join(' / ')}`,
        `Citation: ${logic.citationEligibility.slice(0, 2).join(' / ')}`,
      ].join('\n'))
      .slice(0, 5);

    const guidance = [
      `UpdatedAt: ${new Date().toISOString()}`,
      `Source: ${args.source}`,
      `LastRun: ${args.summary}`,
      '',
      'Platform collection and citation logic:',
      platformLogicBlocks.length > 0 ? platformLogicBlocks.join('\n\n') : 'No platform logic snapshots recorded yet.',
      '',
      'AI-citation article blueprint:',
      '1. H1 = brand/entity + exact user intent, not a generic industry title.',
      '2. Opening answer = 2-3 standalone sentences with brand name, official URL, category, service/location scope, and verified data boundary.',
      '3. Entity facts = official domain, industry, services, audience, location, known limitations, and what is not publicly available.',
      '4. Quote-ready bullets = 4-6 factual bullets that can be copied into an AI answer without context.',
      '5. FAQ = 3-5 real user questions; at least one answer points to the official URL or Geovault directory.',
      '6. Sources = official website, Geovault directory/AI Wiki, and visible facts that match structured data where structured data exists.',
      '',
      'Future article generation rules:',
      '- Prioritize helpful, reliable, people-first content and clear sourceable facts over keyword stuffing.',
      '- Keep each article indexable: unique title, description length >= 80 chars, visible facts that match structured data, and no test/editorial directory names.',
      '- Add crawler-friendly retrieval cues: brand name, industry, official domain, service keywords, FAQ-style questions, and one directory/internal reference when natural.',
      '- Avoid duplicate list-style filler. If crawler audits show no-crawler-7d, make the next article more specific, less generic, and easier to quote.',
      '- For medical-adjacent brands, keep public wording informational and avoid diagnosis, treatment promises, side effects, or recovery claims.',
      '- Maintain access for official AI/search crawlers through normal robots, sitemap, snippets, structured data, and IndexNow/Bing discovery signals.',
      '',
      `Official action items: ${officialActions.length > 0 ? officialActions.join(', ') : 'none recorded yet'}`,
      `Recent crawler issues: ${JSON.stringify(issueCounts)}`,
      `Recent automatic fixes: ${JSON.stringify(fixCounts)}`,
    ].join('\n');

    await this.prisma.systemConfig.upsert({
      where: { key: 'article_generation_crawler_guidance' },
      update: {
        value: guidance,
        description: 'Dynamic guidance for future article generation based on official AI crawler/search guidance and crawler visit audits.',
      },
      create: {
        key: 'article_generation_crawler_guidance',
        value: guidance,
        description: 'Dynamic guidance for future article generation based on official AI crawler/search guidance and crawler visit audits.',
      },
    });
  }

  private getSnapshotActionItems(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (!value || typeof value !== 'object') return [];
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) ? items.map(String) : [];
  }

  private getSnapshotContentLogic(value: unknown): PlatformContentLogic | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const contentLogic = (value as { contentLogic?: unknown }).contentLogic;
    if (!contentLogic || typeof contentLogic !== 'object' || Array.isArray(contentLogic)) return null;
    const candidate = contentLogic as Partial<PlatformContentLogic>;
    if (!candidate.platform || !Array.isArray(candidate.recommendedArticleStructure)) return null;
    return candidate as PlatformContentLogic;
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
