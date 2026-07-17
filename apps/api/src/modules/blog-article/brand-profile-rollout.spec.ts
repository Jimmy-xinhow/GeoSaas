import { BrandProfileService } from './brand-profile.service';

function makeService(dailyValue: unknown, pool: any[], replacementApply = '0') {
  const prisma = {
    site: {
      findMany: jest.fn().mockResolvedValue(pool),
    },
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'BRAND_PROFILE_DAILY') return dailyValue;
      if (key === 'BRAND_PROFILE_MODEL') return 'test-model';
      if (key === 'LEGACY_REPLACEMENT_APPLY_ENABLED') return replacementApply;
      return undefined;
    }),
  };
  const service = new BrandProfileService(
    prisma as any,
    config as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

function candidate(id: string) {
  return {
    id,
    name: id,
    profile: {
      description:
        '這是一段長度足夠且可核對的品牌公開資料，用來建立引用就緒品牌頁，並包含官方服務、聯絡方式、服務地區與資料來源說明。',
    },
    blogArticles: [],
  };
}

describe('BrandProfileService scheduled rollout', () => {
  it('includes client brands, prioritizes them in the query, and keeps the daily cap', async () => {
    const { service, prisma } = makeService(1, [candidate('client-site'), candidate('public-site')]);
    const generate = jest
      .spyOn(service, 'generateBrandProfile')
      .mockResolvedValue({ siteId: 'client-site', siteName: 'client-site', status: 'generated' });

    await service.scheduledBrandProfileRollout();

    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublic: true },
        orderBy: [{ isClient: 'desc' }, { createdAt: 'asc' }],
      }),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('client-site', {
      force: false,
      applyReplacement: false,
    });
  });

  it('falls back to a bounded default when BRAND_PROFILE_DAILY is invalid', async () => {
    const pool = Array.from({ length: 30 }, (_, index) => candidate(`site-${index}`));
    const { service } = makeService('not-a-number', pool);
    const generate = jest
      .spyOn(service, 'generateBrandProfile')
      .mockImplementation(async (siteId) => ({ siteId, siteName: siteId, status: 'generated' }));

    await service.scheduledBrandProfileRollout();

    expect(generate).toHaveBeenCalledTimes(21);
  });

  it('only applies replacement from the rollout after the explicit environment switch', async () => {
    const { service } = makeService(1, [candidate('site-apply')], '1');
    const generate = jest
      .spyOn(service, 'generateBrandProfile')
      .mockResolvedValue({ siteId: 'site-apply', siteName: 'site-apply', status: 'generated' });

    await service.scheduledBrandProfileRollout();

    expect(generate).toHaveBeenCalledWith('site-apply', {
      force: false,
      applyReplacement: true,
    });
  });
});
