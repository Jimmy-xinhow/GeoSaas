import { BlogArticleService } from './blog-article.service';

function createService(prisma: any) {
  return new BlogArticleService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('brand_showcase site eligibility', () => {
  it('skips an editorial/search-result title before any generation work', async () => {
    const prisma = {
      site: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'editorial-site',
          name: '2026 台北 12 家記帳士事務所推薦與挑選攻略',
          url: 'https://example.com/editorial',
          industry: 'accounting',
          profile: {},
          isPublic: true,
          qas: [],
        }),
      },
      blogArticle: { findFirst: jest.fn() },
    };

    await expect(createService(prisma).generateBrandShowcaseForSite('editorial-site'))
      .resolves.toEqual({ status: 'skipped', reasons: ['editorial_site_name'] });
    expect(prisma.blogArticle.findFirst).not.toHaveBeenCalled();
  });

  it('filters editorial names from the daily candidate pool', async () => {
    const prisma = {
      site: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'editorial-site', name: '台北 TOP 10 花店推薦清單完整攻略' },
          { id: 'real-brand', name: '真實品牌有限公司' },
        ]),
      },
    };
    const service = createService(prisma);
    const generate = jest.spyOn(service, 'generateBrandShowcaseForSite')
      .mockResolvedValue({ status: 'generated', slug: 'real-brand-showcase' });

    await expect(service.runBrandShowcaseBatch(1)).resolves.toEqual({
      attempted: 1,
      generated: 1,
      rejected: 0,
      skipped: 0,
      rejectedReasons: {},
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('real-brand');
  });
});
