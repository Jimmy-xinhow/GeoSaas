import { BlogArticleService } from './blog-article.service';

describe('BlogArticleService legacy alias resolution', () => {
  it('falls through from an unpublished legacy record to its published replacement alias', async () => {
    const oldArticle = {
      slug: 'old-score-page',
      title: 'Acme 舊型 GEO 分數分析頁面',
      description: '這是已下架的舊型內容。'.repeat(10),
      content: 'legacy',
      templateType: 'score_breakdown',
      published: false,
      site: { name: 'Acme', url: 'https://acme.example', bestScore: 80, industry: 'software' },
    };
    const replacement = {
      slug: 'acme-brand-profile',
      title: 'Acme 品牌公開資訊與服務範圍完整介紹',
      description: '依據 Acme 官方網站與公開品牌資料，整理服務範圍、適用情境、聯絡方式及可核對資料來源。'.repeat(3),
      content: '## 品牌資訊\n公開資料內容',
      templateType: 'brand_profile',
      published: true,
      site: { name: 'Acme', url: 'https://acme.example', bestScore: 80, industry: 'software' },
    };
    const prisma = {
      blogArticle: {
        findUnique: jest.fn().mockResolvedValue(oldArticle),
        findFirst: jest.fn().mockResolvedValue(replacement),
      },
    };
    const service = new BlogArticleService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getBySlug('old-score-page')).resolves.toBe(replacement);
    expect(prisma.blogArticle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });
});
