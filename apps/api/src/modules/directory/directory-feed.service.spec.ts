jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { DirectoryService } from './directory.service';

describe('DirectoryService per-brand feed', () => {
  it('uses the indexable article boundary and emits only clean quality excerpts', async () => {
    const articleFindMany = jest.fn().mockResolvedValue([
      {
        slug: 'good-article',
        title: '可驗證的品牌資料完整整理',
        description: `## 摘要\n**${'可核對的品牌公開資料'.repeat(12)}**`,
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        site: { name: '測試品牌' },
      },
      {
        slug: 'thin-article',
        title: '過短內容不應進入品牌動態',
        description: '太短',
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        site: { name: '測試品牌' },
      },
    ]);
    const prisma = {
      site: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'site-1',
          name: '測試品牌',
          url: 'https://example.com',
          industry: 'software',
          bestScore: 80,
          updatedAt: new Date('2026-08-10T00:00:00.000Z'),
        }),
      },
      scan: { findMany: jest.fn().mockResolvedValue([]) },
      siteQa: { findMany: jest.fn().mockResolvedValue([]) },
      siteBadge: { findMany: jest.fn().mockResolvedValue([]) },
      blogArticle: { findMany: articleFindMany },
    };

    const result = await new DirectoryService(prisma as any).getSiteFeedEvents('site-1', 50);

    expect(JSON.stringify(articleFindMany.mock.calls[0][0].where)).toContain('templateType');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(expect.objectContaining({
      id: 'article-good-article',
      type: 'article',
    }));
    expect(result.events[0].summary).not.toMatch(/[#*]/);
  });
});
