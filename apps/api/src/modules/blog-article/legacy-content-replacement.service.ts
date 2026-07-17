import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';
import { LEGACY_GEO_TEMPLATE_TYPES } from './legacy-geo-content-audit';

export const LEGACY_REPLACEMENT_APPLY_ENV = 'LEGACY_REPLACEMENT_APPLY_ENABLED';

export interface LegacyReplacementCandidate {
  siteId: string;
  siteName: string;
  replacementId: string;
  replacementSlug: string;
  legacyCount: number;
  publishedLegacyCount: number;
  aliasesToAdd: string[];
  mergedAliases: string[];
}

export interface LegacyReplacementStatus {
  legacyPublishedTotal: number;
  legacyPublishedWithReplacement: number;
  legacyPublishedWithoutReplacement: number;
  replacementSiteCount: number;
  pendingSiteCount: number;
  aliasBackfillPending: number;
  demotionPending: number;
  sample: LegacyReplacementCandidate[];
}

export interface LegacyReplacementBatchResult {
  dryRun: boolean;
  selectedSites: number;
  updatedSites: number;
  demotedArticles: number;
  aliasesAdded: number;
  indexNowSubmitted: boolean;
  items: Array<{
    siteId: string;
    siteName: string;
    replacementSlug: string;
    demotedArticles: number;
    aliasesAdded: number;
    status: 'preview' | 'replaced' | 'skipped';
    reason?: string;
  }>;
}

interface ReplacementArticleRow {
  id: string;
  slug: string;
  aliasSlugs: string[];
  siteId: string | null;
  site: {
    id: string;
    name: string;
    isPublic: boolean;
    blogArticles: Array<{
      id: string;
      slug: string;
      published: boolean;
      templateType: string;
    }>;
  } | null;
}

@Injectable()
export class LegacyContentReplacementService {
  private readonly logger = new Logger(LegacyContentReplacementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly indexNow: IndexNowService,
    private readonly llmsHosting: LlmsHostingService,
  ) {}

  async getStatus(sampleLimit = 20): Promise<LegacyReplacementStatus> {
    const [legacyPublishedTotal, replacementRows] = await Promise.all([
      this.prisma.blogArticle.count({
        where: {
          published: true,
          category: { not: 'case-study' },
          templateType: { in: [...LEGACY_GEO_TEMPLATE_TYPES] },
        },
      }),
      this.loadReplacementRows(),
    ]);
    const candidates = this.buildCandidates(replacementRows);
    const legacyPublishedWithReplacement = candidates.reduce(
      (sum, candidate) => sum + candidate.publishedLegacyCount,
      0,
    );

    return {
      legacyPublishedTotal,
      legacyPublishedWithReplacement,
      legacyPublishedWithoutReplacement: Math.max(
        0,
        legacyPublishedTotal - legacyPublishedWithReplacement,
      ),
      replacementSiteCount: this.latestReplacementBySite(replacementRows).size,
      pendingSiteCount: candidates.length,
      aliasBackfillPending: candidates.filter((candidate) => candidate.aliasesToAdd.length > 0).length,
      demotionPending: candidates.filter((candidate) => candidate.publishedLegacyCount > 0).length,
      sample: candidates.slice(0, Math.max(1, Math.min(sampleLimit, 100))),
    };
  }

  async runBatch(opts: { dryRun?: boolean; limit?: number } = {}): Promise<LegacyReplacementBatchResult> {
    const dryRun = opts.dryRun !== false;
    const limit = Math.max(1, Math.min(opts.limit ?? 25, 100));
    const candidates = this.buildCandidates(await this.loadReplacementRows()).slice(0, limit);
    const items: LegacyReplacementBatchResult['items'] = [];

    if (dryRun) {
      for (const candidate of candidates) {
        items.push({
          siteId: candidate.siteId,
          siteName: candidate.siteName,
          replacementSlug: candidate.replacementSlug,
          demotedArticles: candidate.publishedLegacyCount,
          aliasesAdded: candidate.aliasesToAdd.length,
          status: 'preview',
        });
      }
      return {
        dryRun: true,
        selectedSites: candidates.length,
        updatedSites: 0,
        demotedArticles: 0,
        aliasesAdded: 0,
        indexNowSubmitted: false,
        items,
      };
    }

    let updatedSites = 0;
    let demotedArticles = 0;
    let aliasesAdded = 0;
    const canonicalUrls: string[] = [];

    for (const candidate of candidates) {
      const result = await this.applyCandidate(candidate);
      items.push(result);
      if (result.status !== 'replaced') continue;
      updatedSites++;
      demotedArticles += result.demotedArticles;
      aliasesAdded += result.aliasesAdded;
      canonicalUrls.push(this.articleUrl(result.replacementSlug));
    }

    let indexNowSubmitted = false;
    if (updatedSites > 0) {
      this.llmsHosting.invalidatePlatformLlmsFull();
      try {
        const webUrl = this.webUrl();
        await this.indexNow.submitBatch(canonicalUrls, new URL(webUrl).host);
        indexNowSubmitted = true;
      } catch (error) {
        this.logger.warn(`Legacy replacement IndexNow submit failed: ${String(error).slice(0, 160)}`);
      }
    }

    this.logger.log(
      `legacy replacement: sites=${updatedSites}, demoted=${demotedArticles}, aliases=${aliasesAdded}, dryRun=false`,
    );
    return {
      dryRun: false,
      selectedSites: candidates.length,
      updatedSites,
      demotedArticles,
      aliasesAdded,
      indexNowSubmitted,
      items,
    };
  }

  async replaceForSite(siteId: string): Promise<LegacyReplacementBatchResult['items'][number]> {
    const rows = await this.loadReplacementRows(siteId);
    const candidate = this.buildCandidates(rows)[0];
    if (!candidate) {
      return {
        siteId,
        siteName: rows[0]?.site?.name ?? '',
        replacementSlug: rows[0]?.slug ?? '',
        demotedArticles: 0,
        aliasesAdded: 0,
        status: 'skipped',
        reason: rows.length === 0 ? 'published_replacement_missing' : 'already_replaced',
      };
    }
    const result = await this.applyCandidate(candidate);
    if (result.status === 'replaced') {
      this.llmsHosting.invalidatePlatformLlmsFull(siteId);
      this.indexNow.submitUrl(this.articleUrl(result.replacementSlug)).catch(() => {});
    }
    return result;
  }

  private async applyCandidate(
    candidate: LegacyReplacementCandidate,
  ): Promise<LegacyReplacementBatchResult['items'][number]> {
    const [, demoted] = await this.prisma.$transaction([
      this.prisma.blogArticle.update({
        where: { id: candidate.replacementId },
        data: { aliasSlugs: { set: candidate.mergedAliases } },
        select: { id: true },
      }),
      this.prisma.blogArticle.updateMany({
        where: {
          siteId: candidate.siteId,
          published: true,
          category: { not: 'case-study' },
          templateType: { in: [...LEGACY_GEO_TEMPLATE_TYPES] },
        },
        data: { published: false, lastRegeneratedAt: new Date() },
      }),
    ]);

    return {
      siteId: candidate.siteId,
      siteName: candidate.siteName,
      replacementSlug: candidate.replacementSlug,
      demotedArticles: demoted.count,
      aliasesAdded: candidate.aliasesToAdd.length,
      status: 'replaced',
    };
  }

  private async loadReplacementRows(siteId?: string): Promise<ReplacementArticleRow[]> {
    return this.prisma.blogArticle.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        published: true,
        templateType: 'brand_profile',
      },
      orderBy: { createdAt: 'desc' },
      take: siteId ? 10 : 5000,
      select: {
        id: true,
        slug: true,
        aliasSlugs: true,
        siteId: true,
        site: {
          select: {
            id: true,
            name: true,
            isPublic: true,
            blogArticles: {
              where: {
                category: { not: 'case-study' },
                templateType: { in: [...LEGACY_GEO_TEMPLATE_TYPES] },
              },
              select: {
                id: true,
                slug: true,
                published: true,
                templateType: true,
              },
            },
          },
        },
      },
    });
  }

  private latestReplacementBySite(rows: ReplacementArticleRow[]): Map<string, ReplacementArticleRow> {
    const latest = new Map<string, ReplacementArticleRow>();
    for (const row of rows) {
      if (!row.siteId || !row.site?.isPublic || latest.has(row.siteId)) continue;
      latest.set(row.siteId, row);
    }
    return latest;
  }

  private buildCandidates(rows: ReplacementArticleRow[]): LegacyReplacementCandidate[] {
    const candidates: LegacyReplacementCandidate[] = [];
    for (const row of this.latestReplacementBySite(rows).values()) {
      const site = row.site;
      if (!site || site.blogArticles.length === 0) continue;
      const legacySlugs = [...new Set(site.blogArticles.map((article) => article.slug).filter(Boolean))];
      const mergedAliases = [...new Set([...row.aliasSlugs, ...legacySlugs])].filter(
        (slug) => slug && slug !== row.slug,
      );
      const aliasesToAdd = legacySlugs.filter((slug) => !row.aliasSlugs.includes(slug));
      const publishedLegacyCount = site.blogArticles.filter((article) => article.published).length;
      if (aliasesToAdd.length === 0 && publishedLegacyCount === 0) continue;
      candidates.push({
        siteId: site.id,
        siteName: site.name,
        replacementId: row.id,
        replacementSlug: row.slug,
        legacyCount: site.blogArticles.length,
        publishedLegacyCount,
        aliasesToAdd,
        mergedAliases,
      });
    }
    return candidates.sort(
      (a, b) => b.publishedLegacyCount - a.publishedLegacyCount || a.siteName.localeCompare(b.siteName, 'zh-Hant'),
    );
  }

  private webUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') || 'https://www.geovault.app').replace(/\/$/, '');
  }

  private articleUrl(slug: string): string {
    return `${this.webUrl()}/blog/${encodeURIComponent(slug)}`;
  }
}
