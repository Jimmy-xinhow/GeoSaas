import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';
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
    const duplicateGroups = this.duplicateGroups(articles).slice(0, limit);
    const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.map((article) => article.id)));
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

    let normalizedDescriptions = 0;
    let demotedDuplicates = 0;
    let aliasesAdded = 0;
    let identityBackfills = 0;
    const canonicalUrls: string[] = [];

    for (const article of descriptions) {
      const description = normalizeBlogArticleDescription(article.description);
      if (!description || description === article.description) continue;
      await this.prisma.blogArticle.update({ where: { id: article.id }, data: { description } });
      normalizedDescriptions++;
    }

    for (const group of duplicateGroups) {
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

      demotedDuplicates += duplicates.length;
      aliasesAdded += mergedAliases.filter((slug) => !aliasesBefore.has(slug)).length;
      canonicalUrls.push(this.articleUrl(canonical.slug));
    }

    for (const article of identities) {
      await this.prisma.blogArticle.update({
        where: { id: article.id },
        data: {
          normalizedTitle: normalizeBlogArticleTitle(article.title),
          contentIntent: resolveBlogArticleIntent(article),
          contentKey: buildBlogArticleContentKey(article),
        },
      });
      identityBackfills++;
    }

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
