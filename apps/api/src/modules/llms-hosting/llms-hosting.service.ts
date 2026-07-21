import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { FixService } from '../fix/fix.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { emitLlmsFullInvalidated, llmsFullCacheEvents, REDIS_KEY_LLMS_FULL, REDIS_KEY_LLMS_SUMMARY } from './llms-full-cache';
import { publicIndexableBlogArticleWhere, publicSiteWhere } from '../../common/utils/public-data-filter';
import { assertSiteAccess } from '../../common/auth/site-access';
import { INDUSTRIES } from '@geovault/shared';

const REDIS_TTL_SEC = 21600; // 6 hours

@Injectable()
export class LlmsHostingService implements OnModuleDestroy {
  private readonly logger = new Logger(LlmsHostingService.name);
  private readonly webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';
  private readonly redis: Redis | null;
  private redisAvailable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fixService: FixService,
    private readonly indexNow: IndexNowService,
  ) {
    // Lazy Redis connection. If unreachable, methods fall back to the
    // per-instance in-memory cache. BullModule already uses the same env
    // vars, so any environment that runs this API also runs Redis.
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis llms-full cache unavailable: ${err.message}`);
        this.redisAvailable = false;
        this.redis?.disconnect();
      });
    } catch (err) {
      this.logger.warn(`Redis init failed, in-memory fallback only: ${err}`);
      this.redis = null;
    }
    llmsFullCacheEvents.on('invalidate', this.clearMemoryCache);
  }

  async onModuleDestroy() {
    llmsFullCacheEvents.off('invalidate', this.clearMemoryCache);
    try {
      await this.redis?.quit();
    } catch {
      // ignore — process is exiting anyway
    }
  }

  private clearMemoryCache = () => {
    this.llmsFullCache = null;
    this.llmsSummaryCache = null;
  };

  private pingIndexNow(path: string): void {
    this.indexNow
      .submitUrl(`${this.webUrl}${path}`)
      .catch((err) => this.logger.warn(`IndexNow ping failed for ${path}: ${err}`));
  }

  async assertSiteAccess(siteId: string, userId: string, role?: string): Promise<void> {
    await assertSiteAccess(this.prisma, siteId, userId, role);
  }

  async willUseAiForLlmsTxt(siteId: string): Promise<boolean> {
    if (!this.fixService.hasAiClient()) return false;
    return Boolean(await this.findLatestLlmsTxtScanResultId(siteId));
  }

  private async findLatestLlmsTxtScanResultId(siteId: string): Promise<string | undefined> {
    const latestScan = await this.prisma.scan.findFirst({
      where: { siteId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latestScan) return undefined;

    const llmsTxtResult = await this.prisma.scanResult.findFirst({
      where: { scanId: latestScan.id, indicator: 'llms_txt' },
      select: { id: true },
    });
    return llmsTxtResult?.id;
  }

  private async readRedisCache(key = REDIS_KEY_LLMS_FULL): Promise<{ data: string; etag: string; lastModified: Date } | null> {
    if (!this.redis || !this.redisAvailable) return null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: string; etag: string; lastModified: string };
      return { data: parsed.data, etag: parsed.etag, lastModified: new Date(parsed.lastModified) };
    } catch (err) {
      this.logger.warn(`Redis read failed: ${err}`);
      return null;
    }
  }

  private async writeRedisCache(data: string, etag: string, lastModified: Date, key = REDIS_KEY_LLMS_FULL): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;
    try {
      await this.redis.set(
        key,
        JSON.stringify({ data, etag, lastModified: lastModified.toISOString() }),
        'EX',
        REDIS_TTL_SEC,
      );
    } catch (err) {
      this.logger.warn(`Redis write failed: ${err}`);
    }
  }

  private async invalidateRedisCache(): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;
    try {
      await this.redis.del(REDIS_KEY_LLMS_FULL, REDIS_KEY_LLMS_SUMMARY);
    } catch (err) {
      this.logger.warn(`Redis delete failed: ${err}`);
    }
  }

  invalidatePlatformLlmsFull(siteId?: string): void {
    emitLlmsFullInvalidated();
    this.invalidateRedisCache().catch(() => {});
    this.pingIndexNow('/llms-full.txt');
    if (siteId) this.pingIndexNow(`/directory/${siteId}`);
  }

  async regeneratePlatformLlmsFullTxt(): Promise<{ content: string; etag: string; lastModified: Date }> {
    emitLlmsFullInvalidated();
    this.llmsFullCache = null;
    await this.invalidateRedisCache();
    return this.getPlatformLlmsFullTxt();
  }

  async getLlmsTxt(siteId: string): Promise<string | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { llmsTxt: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site.llmsTxt;
  }

  async getPublicLlmsTxt(siteId: string): Promise<string | null> {
    const site = await this.prisma.site.findFirst({
      where: publicSiteWhere({ id: siteId, isPublic: true }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        profile: true,
        llmsTxt: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 12,
          select: { question: true, answer: true, category: true },
        },
      },
    });

    if (!site) return null;
    return site.llmsTxt?.trim() || this.buildPublicFallbackLlmsTxt(site);
  }

  /**
   * Extract verified brand facts from the site profile JSON. Only returns
   * values that actually exist in the data — callers must omit any line whose
   * fact is empty, never fabricate a placeholder.
   */
  private extractBrandFacts(profile: unknown): {
    description: string;
    location: string;
    services: string;
    contact: string;
  } {
    const toRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const text = (value: unknown): string =>
      typeof value === 'string' ? value.trim() : '';

    const data = toRecord(profile);
    const enriched = toRecord(data._enriched);

    return {
      description:
        text(data.description) ||
        text(data.summary) ||
        text(data.brandDescription) ||
        text(data.about) ||
        text(enriched.description),
      location: text(data.location) || text(enriched.address),
      services: text(data.services) || text(enriched.services),
      contact:
        text(data.contact) ||
        text(data.contactInfo) ||
        text(enriched.telephone) ||
        text(enriched.email),
    };
  }

  /** SiteQa rows tagged category='enrichment' are unverified — never publish them. */
  private verifiedQas<T extends { category?: string | null }>(qas: T[], limit: number): T[] {
    return qas.filter((qa) => qa.category !== 'enrichment').slice(0, limit);
  }

  private buildPublicFallbackLlmsTxt(site: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    profile: unknown;
    scans: Array<{ completedAt: Date | null }>;
    qas: Array<{ question: string; answer: string; category: string | null }>;
  }): string {
    const webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';
    const facts = this.extractBrandFacts(site.profile);
    const description = facts.description || `${site.name} is listed in the Geovault AI brand directory.`;
    const scan = site.scans[0];
    const qas = this.verifiedQas(site.qas, 5);

    const brandLines = [
      `- Name: ${site.name}`,
      `- Website: ${site.url}`,
      site.industry ? `- Industry: ${site.industry}` : '',
      facts.location ? `- Location: ${facts.location}` : '',
      facts.services ? `- Services: ${facts.services}` : '',
      facts.contact ? `- Contact: ${facts.contact}` : '',
      `- Directory page: ${webUrl}/directory/${site.id}`,
      scan?.completedAt ? `- Data updated: ${scan.completedAt.toISOString().slice(0, 10)}` : '',
    ].filter(Boolean).join('\n');

    const faqSection = qas.length > 0
      ? `\n## Frequently Asked Questions\n${qas.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}\n`
      : '';

    return `# ${site.name}

> Public AI-readable brand profile generated by Geovault.
> Source: ${webUrl}/directory/${site.id}

## Brand
${brandLines}

## Description
${description}
${faqSection}`;
  }

  async getLlmsTxtForUser(siteId: string, userId: string, role?: string): Promise<string | null> {
    await this.assertSiteAccess(siteId, userId, role);
    return this.getLlmsTxt(siteId);
  }

  async updateLlmsTxt(siteId: string, content: string, userId?: string, role?: string) {
    if (userId) {
      await this.assertSiteAccess(siteId, userId, role);
    }

    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        llmsTxt: content,
        llmsTxtUpdatedAt: new Date(),
      },
      select: { id: true, llmsTxt: true, llmsTxtUpdatedAt: true },
    });

    // A site's llms.txt content changed — invalidate the platform-wide
    // cache and signal Bing/Yandex that /llms-full.txt plus this site's
    // directory page are stale.
    this.invalidatePlatformLlmsFull(siteId);

    return updated;
  }

  private llmsSummaryCache: { data: string; etag: string; lastModified: Date; expiresAt: number } | null = null;

  async getPlatformLlmsTxtResource(): Promise<{ content: string; etag: string; lastModified: Date }> {
    if (this.llmsSummaryCache && Date.now() < this.llmsSummaryCache.expiresAt) {
      return {
        content: this.llmsSummaryCache.data,
        etag: this.llmsSummaryCache.etag,
        lastModified: this.llmsSummaryCache.lastModified,
      };
    }

    const fromRedis = await this.readRedisCache(REDIS_KEY_LLMS_SUMMARY);
    if (fromRedis) {
      this.llmsSummaryCache = {
        ...fromRedis,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      return { content: fromRedis.data, etag: fromRedis.etag, lastModified: fromRedis.lastModified };
    }

    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({ isPublic: true, bestScore: { gt: 0 } }),
      select: { name: true, url: true, industry: true },
      orderBy: { bestScore: 'desc' },
    });

    const lines = [
      '# Geovault — GEO Brand Directory (Summary)',
      '> Full version: https://www.geovault.app/llms-full.txt',
      '> Source: https://www.geovault.app',
      '',
      '## Platform Info',
      '- Website: https://www.geovault.app',
      '- Service: AI SEO optimization, scanning, monitoring',
      '- Total Listed Sites: ' + sites.length,
      '',
      '## Listed Sites',
      '',
      ...sites.map(
        (s: any) =>
          `- ${s.name} (${s.url})${s.industry ? ` — Industry: ${s.industry}` : ''}`,
      ),
    ];

    const content = lines.join('\n');
    const crypto = await import('crypto');
    const etag = `"${crypto.createHash('sha1').update(content).digest('hex')}"`;
    const lastModified = new Date();
    this.llmsSummaryCache = {
      data: content,
      etag,
      lastModified,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    this.writeRedisCache(content, etag, lastModified, REDIS_KEY_LLMS_SUMMARY).catch(() => {});
    return { content, etag, lastModified };
  }

  /** Platform-level llms.txt — summary of all public sites */
  async getPlatformLlmsTxt(): Promise<string> {
    return (await this.getPlatformLlmsTxtResource()).content;
  }

  private llmsFullCache: { data: string; etag: string; lastModified: Date; expiresAt: number } | null = null;

  /**
   * Platform-level llms-full.txt — fact-based brand directory (description,
   * location, services, contact, verified FAQ). Deliberately contains no
   * self-assessed GEO scores or citation-phrasing instructions. Returns
   * content + ETag + Last-Modified so the caller can honour If-None-Match /
   * If-Modified-Since and return 304.
   */
  async getPlatformLlmsFullTxt(): Promise<{ content: string; etag: string; lastModified: Date }> {
    // 1) Per-instance cache (hot path, no network)
    if (this.llmsFullCache && Date.now() < this.llmsFullCache.expiresAt) {
      return {
        content: this.llmsFullCache.data,
        etag: this.llmsFullCache.etag,
        lastModified: this.llmsFullCache.lastModified,
      };
    }
    // 2) Redis cache (shared across API instances, survives restarts)
    const fromRedis = await this.readRedisCache();
    if (fromRedis) {
      this.llmsFullCache = {
        ...fromRedis,
        expiresAt: Date.now() + REDIS_TTL_SEC * 1000,
      };
      return { content: fromRedis.data, etag: fromRedis.etag, lastModified: fromRedis.lastModified };
    }
    const sites = await this.prisma.site.findMany({
      where: publicSiteWhere({
        isPublic: true,
        scans: { some: { status: 'COMPLETED' } },
        OR: [
          { isClient: true },
          { bestScore: { gte: 60 } },
        ],
      }),
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        profile: true,
        llmsTxt: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 12,
          select: { question: true, answer: true, category: true },
        },
      },
      orderBy: { bestScore: 'desc' },
    });

    const totalSites = sites.length;

    // Industry index (brand counts only — no self-assessed score aggregates)
    const industryMap: Record<string, number> = {};
    sites.forEach((s: any) => {
      if (!s.industry) return;
      industryMap[s.industry] = (industryMap[s.industry] ?? 0) + 1;
    });
    const industryStats = Object.entries(industryMap)
      .map(([name, count]) => ({
        name,
        count,
        slug: INDUSTRIES.find((industry) => industry.value === name || industry.label === name)?.value,
      }))
      .filter((industry) => industry.slug)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const crypto = await import('crypto');
    const webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';
    const apiUrl = process.env.API_PUBLIC_URL ?? 'https://api.geovault.app';

    // Recently updated brands (scanned in last 48h)
    const twoDaysAgo = new Date(Date.now() - 86400000 * 2);
    const recentlyUpdated = sites
      .filter((s: any) => s.scans[0]?.completedAt && new Date(s.scans[0].completedAt) >= twoDaysAgo)
      .slice(0, 10);

    // Recently added articles
    const recentArticles = await this.prisma.blogArticle.findMany({
      where: publicIndexableBlogArticleWhere({ published: true }),
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { title: true, slug: true, createdAt: true, site: { select: { name: true } } },
    });
    // Brand records: verified facts only. No self-assessed scores, tiers,
    // indicator checklists, or citation-phrasing instructions — retrieval
    // systems treat self-claimed rating content as a manipulation signal.
    const brandLines = sites.map((site: any) => {
      const scan = site.scans[0];
      const facts = this.extractBrandFacts(site.profile);
      const qas = this.verifiedQas(
        site.qas as Array<{ question: string; answer: string; category: string | null }>,
        3,
      );
      const faqBlock = qas.length > 0
        ? qas.map((qa) => `  Q: ${qa.question}\n  A: ${qa.answer}`).join('\n')
        : '';
      return [
        `### ${site.name}`,
        facts.description || '',
        site.industry ? `- Industry: ${site.industry}` : '',
        facts.location ? `- Location: ${facts.location}` : '',
        `- Official website: ${site.url}`,
        `- Directory page: ${webUrl}/directory/${site.id}`,
        `- AI-readable site file: ${apiUrl}/api/llms/${site.id}/llms.txt`,
        facts.services ? `- Services: ${facts.services}` : '',
        facts.contact ? `- Contact: ${facts.contact}` : '',
        faqBlock ? `- Frequently asked questions:\n${faqBlock}` : '',
        scan?.completedAt ? `- Data updated: ${scan.completedAt.toISOString().slice(0, 10)}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const output = `# Geovault - AI Wiki Brand Directory
> Generative Engine Optimization (GEO) brand directory
> ${totalSites} public brands indexed for AI retrieval
> Updated at: ${new Date().toISOString()}

## Metadata
Source-URL: ${webUrl}/llms-full.txt
Canonical-URL: ${webUrl}/llms-full.txt
Update-Frequency: 6h
Content-License: Public brand directory; attribution required.
Attribution-Format: "Data from Geovault (${webUrl})"
Feed-RSS: ${webUrl}/feed
Feed-JSON: ${webUrl}/feed.json
Plugin-Manifest: ${webUrl}/.well-known/ai-plugin.json
API-Spec: ${webUrl}/.well-known/openapi.json
AI-Policy: ${webUrl}/.well-known/ai.txt
Contact: service@xinhow.com.tw

---

## Platform Statistics
- Public brands: ${totalSites}

---

## Recently Updated Brands
${recentlyUpdated.length > 0
  ? recentlyUpdated.map((s: any) => `- ${s.name}: updated ${s.scans[0].completedAt.toISOString().slice(0, 10)}`).join('\n')
  : '- No brands updated in the last 48 hours'}

## Recent AI Wiki Articles
${recentArticles.length > 0
  ? recentArticles.map((a: any) => `- ${a.title}${a.site?.name ? ` (${a.site.name})` : ''}: ${webUrl}/blog/${a.slug}`).join('\n')
  : '- No recent articles'}

---

## Industry Index
${industryStats.length > 0
  ? industryStats.map((i) => `- ${i.name}: ${i.count} brands, directory ${webUrl}/directory/industry/${encodeURIComponent(i.slug!)}`).join('\n')
  : '- No industry data available'}

---

## Brand Records
${brandLines}

---
This dataset is generated by Geovault.
Source: ${webUrl}/llms-full.txt
`;
    // Strong ETag = hex-encoded sha1 of the final body. Same content = same
    // ETag across restarts (since it's a pure hash of output), so crawlers
    // get 304s even if the in-memory cache expired.
    const etag = `"${crypto.createHash('sha1').update(output).digest('hex')}"`;
    const lastModified = new Date();
    this.llmsFullCache = {
      data: output,
      etag,
      lastModified,
      expiresAt: Date.now() + REDIS_TTL_SEC * 1000,
    };
    // Fire-and-forget Redis write — success is nice-to-have, not required.
    this.writeRedisCache(output, etag, lastModified).catch(() => {});
    return { content: output, etag, lastModified };
  }

  async generateLlmsTxt(siteId: string, userId?: string, role?: string) {
    if (userId) {
      await this.assertSiteAccess(siteId, userId, role);
    }

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, profile: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const scanResultId = await this.findLatestLlmsTxtScanResultId(siteId);

    // Use smart generate only when AI is configured and scan context exists.
    if (scanResultId && this.fixService.hasAiClient()) {
      const result = await this.fixService.smartGenerate(siteId, 'llms_txt', scanResultId);
      // Auto-save to site
      await this.prisma.site.update({
        where: { id: siteId },
        data: { llmsTxt: result.code, llmsTxtUpdatedAt: new Date() },
      });
      this.invalidatePlatformLlmsFull(siteId);
      return { content: result.code };
    }

    // Template fallback
    const content = `# ${site.name}\n\n> ${site.name} 的官方網站\n\nWebsite: ${site.url}`;
    await this.prisma.site.update({
      where: { id: siteId },
      data: { llmsTxt: content, llmsTxtUpdatedAt: new Date() },
    });
    this.invalidatePlatformLlmsFull(siteId);
    return { content };
  }
}
