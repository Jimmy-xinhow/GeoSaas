import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSiteAccess } from '../../common/auth/site-access';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { CrawlerService } from './crawler/crawler.service';
import { ParserService } from './crawler/parser.service';

export type DeepPageStatus = 'ok' | 'failed';

export interface DeepPageAnalysis {
  url: string;
  status: DeepPageStatus;
  statusCode?: number;
  title?: string;
  jsonLdScripts: number;
  schemaTypes: string[];
  hasFaqSchema: boolean;
  faqQuestionCount: number;
  hasArticleSchema: boolean;
  hasVisibleQuestionText: boolean;
  error?: string;
}

export interface DeepSiteAnalysisResult {
  analyzedAt: string;
  requiredPlan: 'PRO';
  pageLimit: number;
  site: { id: string; name: string; url: string };
  summary: {
    pagesAnalyzed: number;
    pagesFailed: number;
    jsonLdPages: number;
    faqSchemaPages: number;
    faqQuestionCount: number;
    articleSchemaPages: number;
    visibleQuestionTextPages: number;
  };
  pages: DeepPageAnalysis[];
  interpretation: string;
}

function flattenJsonLd(raw: any[]): any[] {
  const result: any[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      result.push(...flattenJsonLd(item));
    } else if (item && typeof item === 'object') {
      if (Array.isArray(item['@graph'])) {
        const ctx = item['@context'];
        for (const node of item['@graph']) {
          result.push({ ...(ctx && !node['@context'] ? { '@context': ctx } : {}), ...node });
        }
      } else {
        result.push(item);
      }
    }
  }
  return result;
}

function schemaTypes(item: any): string[] {
  const raw = item?.['@type'];
  if (Array.isArray(raw)) return raw.map(String);
  return raw ? [String(raw)] : [];
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

@Injectable()
export class DeepSiteAnalysisService {
  private readonly logger = new Logger(DeepSiteAnalysisService.name);
  private readonly maxPages = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: CrawlerService,
    private readonly parser: ParserService,
    private readonly planUsage: PlanUsageService,
  ) {}

  async analyzeSite(siteId: string, userId: string, role?: string): Promise<DeepSiteAnalysisResult> {
    await assertSiteAccess(this.prisma, siteId, userId, role);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const effectivePlan = await this.planUsage.getEffectivePlan(userId, user.plan);
    const canUse =
      effectivePlan === 'PRO' ||
      ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) ||
      ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(String(role || '').toUpperCase());

    if (!canUse) {
      throw new ForbiddenException({
        code: 'PRO_REQUIRED',
        message: '站內深度分析為 Pro 功能。升級 Pro 後可掃描多個內頁，判斷 FAQ Schema 與 AI 可讀訊號分布。',
        requiredPlan: 'PRO',
        currentPlan: effectivePlan,
      });
    }

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const startUrl = this.normalizeHttpUrl(site.url);
    const urls = await this.discoverUrls(startUrl);
    const pages: DeepPageAnalysis[] = [];

    for (const url of urls) {
      pages.push(await this.analyzePage(url));
    }

    const faqPages = pages.filter((page) => page.hasFaqSchema);
    const jsonLdPages = pages.filter((page) => page.jsonLdScripts > 0);
    const articlePages = pages.filter((page) => page.hasArticleSchema);
    const questionTextPages = pages.filter((page) => page.hasVisibleQuestionText);

    return {
      analyzedAt: new Date().toISOString(),
      requiredPlan: 'PRO',
      pageLimit: this.maxPages,
      site,
      summary: {
        pagesAnalyzed: pages.length,
        pagesFailed: pages.filter((page) => page.status === 'failed').length,
        jsonLdPages: jsonLdPages.length,
        faqSchemaPages: faqPages.length,
        faqQuestionCount: faqPages.reduce((sum, page) => sum + page.faqQuestionCount, 0),
        articleSchemaPages: articlePages.length,
        visibleQuestionTextPages: questionTextPages.length,
      },
      pages,
      interpretation: this.buildInterpretation(pages),
    };
  }

  private normalizeHttpUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Site URL is invalid');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTP(S) site URLs can be analyzed');
    }
    parsed.hash = '';
    return parsed.toString();
  }

  private async discoverUrls(startUrl: string): Promise<string[]> {
    const found = new Set<string>([startUrl]);
    const candidates: string[] = [];

    await this.collectFromSitemap(startUrl, candidates);

    try {
      const home = await this.crawler.crawl(startUrl);
      const $ = this.parser.load(home.html);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const resolved = this.resolveInternalUrl(href, startUrl);
        if (resolved) candidates.push(resolved);
      });
    } catch (error) {
      this.logger.warn(`Deep analysis URL discovery failed for ${startUrl}: ${error}`);
    }

    for (const url of this.prioritizeUrls(candidates)) {
      if (found.size >= this.maxPages) break;
      found.add(url);
    }

    return Array.from(found);
  }

  private async collectFromSitemap(startUrl: string, candidates: string[]) {
    try {
      const base = new URL(startUrl);
      const sitemapUrl = `${base.protocol}//${base.host}/sitemap.xml`;
      const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const xml = await response.text();
      for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
        const resolved = this.resolveInternalUrl(match[1], startUrl);
        if (resolved) candidates.push(resolved);
      }
    } catch {
      // Sitemap is optional; homepage discovery still works.
    }
  }

  private resolveInternalUrl(href: string, startUrl: string): string | null {
    try {
      const base = new URL(startUrl);
      const url = new URL(href, startUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (normalizeHost(url.hostname) !== normalizeHost(base.hostname)) return null;
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private prioritizeUrls(urls: string[]): string[] {
    const unique = Array.from(new Set(urls));
    return unique.sort((a, b) => this.urlPriority(b) - this.urlPriority(a));
  }

  private urlPriority(url: string): number {
    const lower = url.toLowerCase();
    let score = 0;
    if (/faq|qa|question|knowledge|guide/.test(lower)) score += 30;
    if (/blog|topic|article|detail|post|news/.test(lower)) score += 20;
    if (/[?&](id|title|slug)=/.test(lower)) score += 10;
    if (lower.endsWith('.pdf') || lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) score -= 50;
    return score;
  }

  private async analyzePage(url: string): Promise<DeepPageAnalysis> {
    try {
      const crawl = await this.crawler.crawl(url);
      const $ = this.parser.load(crawl.html);
      const rawScripts: any[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          rawScripts.push(JSON.parse($(el).html() || ''));
        } catch {
          // Invalid JSON-LD is still counted by script count, but not parsed.
        }
      });

      const schemas = flattenJsonLd(rawScripts);
      const types = Array.from(new Set(schemas.flatMap(schemaTypes)));
      const faqSchemas = schemas.filter((item) => schemaTypes(item).includes('FAQPage'));
      const faqQuestionCount = faqSchemas.reduce((sum, faq) => {
        return sum + (Array.isArray(faq.mainEntity) ? faq.mainEntity.length : 0);
      }, 0);
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      return {
        url,
        status: 'ok',
        statusCode: crawl.statusCode,
        title: $('title').text().trim() || undefined,
        jsonLdScripts: rawScripts.length,
        schemaTypes: types,
        hasFaqSchema: faqSchemas.length > 0,
        faqQuestionCount,
        hasArticleSchema: types.some((type) => ['Article', 'BlogPosting', 'NewsArticle'].includes(type)),
        hasVisibleQuestionText: /FAQ|常見問題|Q[:：]|問題|為什麼|怎麼|如何/.test(text),
      };
    } catch (error) {
      return {
        url,
        status: 'failed',
        jsonLdScripts: 0,
        schemaTypes: [],
        hasFaqSchema: false,
        faqQuestionCount: 0,
        hasArticleSchema: false,
        hasVisibleQuestionText: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildInterpretation(pages: DeepPageAnalysis[]): string {
    const faqPages = pages.filter((page) => page.hasFaqSchema);
    if (faqPages.length > 0) {
      return `已在 ${faqPages.length} 個內頁偵測到 FAQPage schema，共 ${faqPages.reduce((sum, page) => sum + page.faqQuestionCount, 0)} 題。`;
    }
    const questionLikePages = pages.filter((page) => page.hasVisibleQuestionText);
    if (questionLikePages.length > 0) {
      return `未偵測到 FAQPage schema，但 ${questionLikePages.length} 個頁面有問答型文字，建議整理成 JSON-LD FAQPage。`;
    }
    return '未偵測到 FAQPage schema 或明顯問答型內容。';
  }
}
