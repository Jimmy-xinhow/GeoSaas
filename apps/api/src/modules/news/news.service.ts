import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List published news articles (paginated) */
  async list(params: { page?: number; limit?: number; category?: string; locale?: string }) {
    const { page = 1, limit = 12, category } = params;
    const skip = (page - 1) * limit;
    const locale = params.locale || 'zh-TW';

    const where: any = { published: true };
    if (category) where.category = category;

    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.newsArticle.count({ where }),
    ]);

    // Return localized fields
    const localized = items.map((item: any) => ({
      id: item.id,
      slug: item.slug,
      title: this.localize(item.title, item.titleEn, item.titleJa, locale),
      summary: this.localize(item.summary, item.summaryEn, item.summaryJa, locale),
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      category: item.category,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
    }));

    return { items: localized, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Get single news article by slug */
  async getBySlug(slug: string, locale = 'zh-TW') {
    const item = await this.prisma.newsArticle.findUnique({ where: { slug } });
    if (!item) return null;

    return {
      id: item.id,
      slug: item.slug,
      title: this.localize(item.title, item.titleEn, item.titleJa, locale),
      summary: this.localize(item.summary, item.summaryEn, item.summaryJa, locale),
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      category: item.category,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
    };
  }

  /** Create a news article (admin/cron use) */
  async create(data: {
    title: string;
    titleEn?: string;
    titleJa?: string;
    summary: string;
    summaryEn?: string;
    summaryJa?: string;
    sourceUrl: string;
    sourceName: string;
    category?: string;
    imageUrl?: string;
  }) {
    const slug = `news-${data.title.slice(0, 30).replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').toLowerCase()}-${Date.now().toString(36)}`;

    return this.prisma.newsArticle.create({
      data: {
        slug,
        ...data,
      },
    });
  }

  /** Get latest news for homepage widget */
  async getLatest(limit = 5) {
    return this.prisma.newsArticle.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        sourceName: true,
        category: true,
        publishedAt: true,
      },
    });
  }

  private localize(zhTW: string, en: string | null, ja: string | null, locale: string): string {
    switch (locale) {
      case 'en':
        return en || zhTW;
      case 'ja':
        return ja || zhTW;
      default:
        return zhTW;
    }
  }
}
