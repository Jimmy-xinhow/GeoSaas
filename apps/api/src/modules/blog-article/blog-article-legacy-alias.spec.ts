import { BlogArticleService } from './blog-article.service';

describe('BlogArticleService legacy alias resolution', () => {
  it('falls through from an unpublished legacy record to its published replacement alias', async () => {
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
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(replacement),
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
    expect(prisma.blogArticle.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
        orderBy: { updatedAt: 'desc' },
      }),
    );
    expect(JSON.stringify(prisma.blogArticle.findFirst.mock.calls[1][0].where))
      .not.toContain('templateType');
  });

  it('does not route a published article linked to a non-public site', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new BlogArticleService(
      { blogArticle: { findFirst } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getBySlug('private-site-article')).resolves.toBeNull();
    const where = JSON.stringify(findFirst.mock.calls[0][0].where);
    expect(where).toContain('"retiredAt":null');
    expect(where).toContain('"isPublic":true');
  });
});
