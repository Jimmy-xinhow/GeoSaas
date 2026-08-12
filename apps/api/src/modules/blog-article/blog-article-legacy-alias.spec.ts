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

  it('does not route a medical-adjacent brand showcase with unsafe claims', async () => {
    const unsafe = {
      slug: 'unsafe-medical-showcase',
      title: '某整復品牌服務特色與適合對象完整介紹',
      description: '依據官方網站公開資訊整理品牌服務、地點、聯絡方式與適用情境，供消費者核對原始資料來源。'.repeat(3),
      content: '## 服務特色\n這項服務可以改善疼痛並促進血液循環。',
      category: 'brand-directory',
      templateType: 'brand_showcase',
      published: true,
      site: { name: '某整復品牌', url: 'https://medical.example', bestScore: 80, industry: 'traditional_medicine' },
    };
    const findFirst = jest.fn().mockResolvedValueOnce(unsafe).mockResolvedValueOnce(null);
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

    await expect(service.getBySlug(unsafe.slug)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('applies the full public blocker set to client daily route safety', () => {
    const service = new BlogArticleService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect((service as any).isClientDailyArticleSafe({
      title: '慈愛中醫診所服務說明',
      description: '以公開品牌資料整理診所服務與聯絡方式。',
      content: '# 慈愛中醫診所服務說明\n\n本療程可改善疼痛。',
      targetKeywords: ['慈愛中醫', '中醫'],
      site: {
        name: '慈愛中醫',
        url: 'https://medical.example',
        industry: 'traditional_medicine',
        isPublic: true,
      },
    })).toBe(false);
  });

  it('blocks client daily content that exposes a local-only source URL', () => {
    const service = new BlogArticleService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const article = {
      title: 'Acme 公開品牌資訊與資料來源整理',
      description: '依據 Acme 官方網站與公開品牌資料，整理服務範圍、適用情境、聯絡方式以及讀者可以核對的原始資料來源。'.repeat(2),
      content: '# Acme 公開品牌資訊與資料來源整理\n\n## 資料來源\n- 官方網站：https://acme.example\n- Geovault 目錄：http://localhost:3002/directory/acme',
      targetKeywords: ['client_daily', 'ai_wiki'],
      site: {
        name: 'Acme',
        url: 'https://acme.example',
        industry: 'technology',
        isPublic: true,
      },
    };

    expect((service as any).clientDailyPublicBlockers(article))
      .toContain('seo:non-public-source-url');
    expect((service as any).isClientDailyArticleSafe(article)).toBe(false);
  });
});
