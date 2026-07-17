import { LegacyContentReplacementService } from './legacy-content-replacement.service';

function replacementRow() {
  return {
    id: 'profile-1',
    slug: 'acme-brand-profile',
    aliasSlugs: ['old-overview'],
    siteId: 'site-1',
    site: {
      id: 'site-1',
      name: 'Acme',
      isPublic: true,
      blogArticles: [
        { id: 'legacy-1', slug: 'old-overview', published: true, templateType: 'geo_overview' },
        { id: 'legacy-2', slug: 'old-score', published: true, templateType: 'score_breakdown' },
      ],
    },
  };
}

describe('LegacyContentReplacementService', () => {
  const prisma = {
    blogArticle: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue('https://www.geovault.app') };
  const indexNow = { submitBatch: jest.fn(), submitUrl: jest.fn() };
  const llmsHosting = { invalidatePlatformLlmsFull: jest.fn() };

  let service: LegacyContentReplacementService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('https://www.geovault.app');
    prisma.blogArticle.findMany.mockResolvedValue([replacementRow()]);
    prisma.blogArticle.count.mockResolvedValue(2);
    prisma.blogArticle.update.mockResolvedValue({ id: 'profile-1' });
    prisma.blogArticle.updateMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockResolvedValue([{ id: 'profile-1' }, { count: 2 }]);
    indexNow.submitBatch.mockResolvedValue([]);
    indexNow.submitUrl.mockResolvedValue([]);
    service = new LegacyContentReplacementService(
      prisma as any,
      config as any,
      indexNow as any,
      llmsHosting as any,
    );
  });

  it('defaults to a read-only preview', async () => {
    const result = await service.runBatch({ limit: 10 });

    expect(result).toMatchObject({
      dryRun: true,
      selectedSites: 1,
      updatedSites: 0,
      demotedArticles: 0,
    });
    expect(result.items[0]).toMatchObject({
      replacementSlug: 'acme-brand-profile',
      aliasesAdded: 1,
      demotedArticles: 2,
      status: 'preview',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('transfers every old slug before demoting legacy articles', async () => {
    const result = await service.runBatch({ dryRun: false, limit: 10 });

    expect(prisma.blogArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-1' },
        data: { aliasSlugs: { set: ['old-overview', 'old-score'] } },
      }),
    );
    expect(prisma.blogArticle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ siteId: 'site-1', published: true }),
        data: expect.objectContaining({ published: false }),
      }),
    );
    expect(result).toMatchObject({
      dryRun: false,
      updatedSites: 1,
      demotedArticles: 2,
      aliasesAdded: 1,
      indexNowSubmitted: true,
    });
    expect(llmsHosting.invalidatePlatformLlmsFull).toHaveBeenCalledTimes(1);
    expect(indexNow.submitBatch).toHaveBeenCalledWith(
      ['https://www.geovault.app/blog/acme-brand-profile'],
      'www.geovault.app',
    );
  });

  it('is idempotent after aliases are transferred and old pages are demoted', async () => {
    const row = replacementRow();
    row.aliasSlugs = ['old-overview', 'old-score'];
    row.site.blogArticles.forEach((article) => { article.published = false; });
    prisma.blogArticle.findMany.mockResolvedValue([row]);

    const result = await service.runBatch({ dryRun: false });

    expect(result.selectedSites).toBe(0);
    expect(result.updatedSites).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports legacy content that still lacks a replacement', async () => {
    prisma.blogArticle.count.mockResolvedValue(8);
    const status = await service.getStatus();

    expect(status).toMatchObject({
      legacyPublishedTotal: 8,
      legacyPublishedWithReplacement: 2,
      legacyPublishedWithoutReplacement: 6,
      aliasBackfillPending: 1,
      demotionPending: 1,
    });
  });
});
