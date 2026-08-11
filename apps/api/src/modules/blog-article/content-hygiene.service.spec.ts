jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ContentHygieneService } from './content-hygiene.service';

describe('ContentHygieneService', () => {
  const rows = [
    {
      id: 'newer', siteId: 'site-1', slug: 'newer', aliasSlugs: [],
      title: '同一個品牌標題', description: `## 摘要\n${'公開資料'.repeat(30)}`,
      templateType: 'brand_profile', category: 'analysis', contentKey: null,
      normalizedTitle: null, contentIntent: null, createdAt: new Date('2026-08-12'),
    },
    {
      id: 'older', siteId: 'site-1', slug: 'older', aliasSlugs: [],
      title: '同一個品牌標題', description: '這是一段已經是純文字而且長度足夠的品牌公開資料說明，用於確認重複文章會被辨識但不會在預演階段修改。'.repeat(2),
      templateType: 'brand_profile', category: 'analysis', contentKey: null,
      normalizedTitle: null, contentIntent: null, createdAt: new Date('2026-08-11'),
    },
    {
      id: 'unique', siteId: 'site-1', slug: 'unique', aliasSlugs: [],
      title: '另一個不重複標題', description: '這是一段純文字品牌資料說明，內容長度足以作為摘要並且沒有任何 Markdown 標記。'.repeat(2),
      templateType: 'faq_deepdive', category: 'analysis', contentKey: null,
      normalizedTitle: null, contentIntent: null, createdAt: new Date('2026-08-10'),
    },
  ];

  function service() {
    const prisma = { blogArticle: { findMany: jest.fn().mockResolvedValue(rows) } };
    return new ContentHygieneService(prisma as any, {} as any, {} as any);
  }

  it('reports duplicate groups, markdown descriptions, and missing identities', async () => {
    const status = await service().getStatus();
    expect(status).toEqual(expect.objectContaining({
      publishedArticles: 3,
      duplicateGroups: 1,
      duplicateArticles: 2,
      contentIdentityMissing: 3,
    }));
    expect(status.descriptionsNeedingNormalization).toBeGreaterThan(0);
  });

  it('defaults to a no-write preview', async () => {
    const result = await service().runBatch();
    expect(result).toEqual(expect.objectContaining({
      dryRun: true,
      selectedDuplicateGroups: 1,
      selectedIdentityBackfills: 1,
      normalizedDescriptions: 0,
      demotedDuplicates: 0,
    }));
  });

  it('preserves duplicate slugs as aliases before demoting duplicate pages', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'updated' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      blogArticle: {
        findMany: jest.fn().mockResolvedValue(rows),
        update,
        updateMany,
      },
      $transaction: jest.fn().mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const llmsHosting = { invalidatePlatformLlmsFull: jest.fn().mockResolvedValue(undefined) };
    const indexNow = { submitBatch: jest.fn().mockResolvedValue(undefined) };

    const result = await new ContentHygieneService(
      prisma as any,
      indexNow as any,
      llmsHosting as any,
    ).runBatch({ dryRun: false, limit: 10 });

    expect(result).toEqual(expect.objectContaining({
      dryRun: false,
      demotedDuplicates: 1,
      aliasesAdded: 1,
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['older'] }, published: true },
      data: expect.objectContaining({
        published: false,
        retirementReason: 'duplicate_title_intent',
      }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'newer' },
      data: expect.objectContaining({ aliasSlugs: { set: ['older'] } }),
    }));
    expect(llmsHosting.invalidatePlatformLlmsFull).toHaveBeenCalled();
    expect(indexNow.submitBatch).toHaveBeenCalled();
  });
});
