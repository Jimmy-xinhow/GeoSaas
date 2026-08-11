import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';
import pLimit from '../../common/utils/p-limit';
import {
  buildBlogArticleContentKey,
  normalizeBlogArticleDescription,
  normalizeBlogArticleTitle,
  resolveBlogArticleIntent,
} from './blog-article-normalization';

const PREFERRED_TEMPLATES = new Set([
  'brand_profile',
  'faq_deepdive',
  'brand_showcase',
  'client_daily',
  'industry_top10',
  'buyer_guide',
  'industry_current_state',
]);

interface ArticleRow {
  id: string;
  siteId: string | null;
  slug: string;
  aliasSlugs: string[];
  title: string;
  description: string;
  templateType: string;
  category: string;
  contentKey: string | null;
  normalizedTitle: string | null;
  contentIntent: string | null;
  createdAt: Date;
}

@Injectable()
export class ContentHygieneService {
  private readonly logger = new Logger(ContentHygieneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexNow: IndexNowService,
    private readonly llmsHosting: LlmsHostingService,
  ) {}

  async getStatus(sampleLimit = 20) {
    const articles = await this.loadPublishedArticles();
    const duplicateGroups = this.duplicateGroups(articles);
    const descriptions = articles.filter(
      (article) => normalizeBlogArticleDescription(article.description) !== article.description,
    );
    const missingIdentity = articles.filter((article) => !article.contentKey);

    return {
      publishedArticles: articles.length,
      descriptionsNeedingNormalization: descriptions.length,
      duplicateGroups: duplicateGroups.length,
      duplicateArticles: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
      contentIdentityMissing: missingIdentity.length,
      duplicateSamples: duplicateGroups.slice(0, Math.max(1, Math.min(sampleLimit, 100))).map((group) => ({
        siteId: group[0].siteId,
        intent: resolveBlogArticleIntent(group[0]),
        normalizedTitle: normalizeBlogArticleTitle(group[0].title),
        articles: group.map((article) => ({ id: article.id, slug: article.slug, title: article.title })),
      })),
    };
  }

  async runBatch(opts: { dryRun?: boolean; limit?: number } = {}) {
    const dryRun = opts.dryRun !== false;
    const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
    const articles = await this.loadPublishedArticles();
    const allDuplicateGroups = this.duplicateGroups(articles);
    const duplicateGroups = allDuplicateGroups.slice(0, limit);
    // Never backfill either side of an unresolved duplicate group. Otherwise a
    // later group can receive the same unique contentKey before its canonical
    // row and aliases are selected for consolidation.
    const duplicateIds = new Set(
      allDuplicateGroups.flatMap((group) => group.map((article) => article.id)),
    );
    const descriptions = articles
      .filter((article) => normalizeBlogArticleDescription(article.description) !== article.description)
      .slice(0, limit);
    const identities = articles
      .filter((article) => !article.contentKey && !duplicateIds.has(article.id))
      .slice(0, limit);

    if (dryRun) {
      return {
        dryRun: true,
        selectedDescriptionUpdates: descriptions.length,
        selectedDuplicateGroups: duplicateGroups.length,
        selectedIdentityBackfills: identities.length,
        normalizedDescriptions: 0,
        demotedDuplicates: 0,
        aliasesAdded: 0,
        identityBackfills: 0,
      };
    }

    const writeLimit = pLimit(10);
    const descriptionUpdates = await Promise.all(descriptions.map((article) =>
      writeLimit(async () => {
        const description = normalizeBlogArticleDescription(article.description);
        if (!description || description === article.description) return 0;
        await this.prisma.blogArticle.update({ where: { id: article.id }, data: { description } });
        return 1;
      }),
    ));
    const normalizedDescriptions = descriptionUpdates.reduce<number>((sum, count) => sum + count, 0);

    const duplicateUpdates = await Promise.all(duplicateGroups.map((group) =>
      writeLimit(async () => {
        const [canonical, ...duplicates] = this.sortCanonicalFirst(group);
        const duplicateSlugs = duplicates.map((article) => article.slug);
        const mergedAliases = [...new Set([
          ...canonical.aliasSlugs,
          ...duplicateSlugs,
          ...duplicates.flatMap((article) => article.aliasSlugs),
        ])].filter((slug) => slug && slug !== canonical.slug);
        const aliasesBefore = new Set(canonical.aliasSlugs);
        const contentIntent = resolveBlogArticleIntent(canonical);
        const normalizedTitle = normalizeBlogArticleTitle(canonical.title);
        const contentKey = buildBlogArticleContentKey(canonical);

        await this.prisma.$transaction([
          this.prisma.blogArticle.updateMany({
            where: { id: { in: duplicates.map((article) => article.id) }, published: true },
            data: {
              published: false,
              retiredAt: new Date(),
              retirementReason: 'duplicate_title_intent',
              contentKey: null,
            },
          }),
          this.prisma.blogArticle.update({
            where: { id: canonical.id },
            data: {
              aliasSlugs: { set: mergedAliases },
              normalizedTitle,
              contentIntent,
              contentKey,
            },
          }),
        ]);

        return {
          demotedDuplicates: duplicates.length,
          aliasesAdded: mergedAliases.filter((slug) => !aliasesBefore.has(slug)).length,
          canonicalUrl: this.articleUrl(canonical.slug),
        };
      }),
    ));
    const demotedDuplicates = duplicateUpdates.reduce(
      (sum, update) => sum + update.demotedDuplicates,
      0,
    );
    const aliasesAdded = duplicateUpdates.reduce(
      (sum, update) => sum + update.aliasesAdded,
      0,
    );
    const canonicalUrls = duplicateUpdates.map((update) => update.canonicalUrl);

    const identityUpdates = await Promise.all(identities.map((article) =>
      writeLimit(async () => {
        await this.prisma.blogArticle.update({
          where: { id: article.id },
          data: {
            normalizedTitle: normalizeBlogArticleTitle(article.title),
            contentIntent: resolveBlogArticleIntent(article),
            contentKey: buildBlogArticleContentKey(article),
          },
        });
        return 1;
      }),
    ));
    const identityBackfills = identityUpdates.reduce<number>((sum, count) => sum + count, 0);

    if (normalizedDescriptions > 0 || demotedDuplicates > 0 || identityBackfills > 0) {
      await this.llmsHosting.invalidatePlatformLlmsFull();
    }
    if (canonicalUrls.length > 0) {
      try {
        await this.indexNow.submitBatch(canonicalUrls, new URL(this.webUrl()).host);
      } catch (error) {
        this.logger.warn(`Content hygiene IndexNow submit failed: ${String(error).slice(0, 160)}`);
      }
    }

    return {
      dryRun: false,
      selectedDescriptionUpdates: descriptions.length,
      selectedDuplicateGroups: duplicateGroups.length,
      selectedIdentityBackfills: identities.length,
      normalizedDescriptions,
      demotedDuplicates,
      aliasesAdded,
      identityBackfills,
    };
  }

  private async loadPublishedArticles(): Promise<ArticleRow[]> {
    return this.prisma.blogArticle.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      select: {
        id: true,
        siteId: true,
        slug: true,
        aliasSlugs: true,
        title: true,
        description: true,
        templateType: true,
        category: true,
        contentKey: true,
        normalizedTitle: true,
        contentIntent: true,
        createdAt: true,
      },
    });
  }

  private duplicateGroups(articles: ArticleRow[]): ArticleRow[][] {
    const groups = new Map<string, ArticleRow[]>();
    for (const article of articles) {
      if (!article.siteId) continue;
      const contentKey = buildBlogArticleContentKey(article);
      if (!contentKey) continue;
      const group = groups.get(contentKey) || [];
      group.push(article);
      groups.set(contentKey, group);
    }
    return [...groups.values()]
      .filter((group) => group.length > 1)
      .sort((a, b) => b.length - a.length || b[0].createdAt.getTime() - a[0].createdAt.getTime());
  }

  private sortCanonicalFirst(group: ArticleRow[]): ArticleRow[] {
    return [...group].sort((a, b) => {
      const preferred = Number(PREFERRED_TEMPLATES.has(b.templateType))
        - Number(PREFERRED_TEMPLATES.has(a.templateType));
      return preferred || b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  private webUrl(): string {
    return (process.env.FRONTEND_URL || 'https://www.geovault.app').replace(/\/$/, '');
  }

  private articleUrl(slug: string): string {
    return `${this.webUrl()}/blog/${encodeURIComponent(slug)}`;
  }
}
