jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { AnalyticsSyncService } from './analytics-sync.service';
import { normalizeMeasurementDateRange, parseGa4Date } from './analytics-sync.utils';

describe('analytics sync date handling', () => {
  it('parses GA4 compact dates as UTC calendar dates', () => {
    expect(parseGa4Date('20260811').toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('keeps an explicit valid date range', () => {
    expect(normalizeMeasurementDateRange('2026-07-01', '2026-07-28')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-28',
    });
  });

  it('rejects reversed and over-wide ranges', () => {
    expect(() => normalizeMeasurementDateRange('2026-07-02', '2026-07-01')).toThrow();
    expect(() => normalizeMeasurementDateRange('2026-01-01', '2026-07-01')).toThrow();
  });
});

describe('AnalyticsSyncService opportunity queue', () => {
  it('uses impression-weighted position and returns query-to-page evidence', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page: 'https://www.geovault.app/cases',
        clicks: 0,
        impressions: 24,
        position: 5.8,
      }])
      .mockResolvedValueOnce([{
        page: 'https://www.geovault.app/cases',
        query: 'GEO 成功案例',
        clicks: 0,
        impressions: 24,
        position: 5.8,
      }]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
      blogArticle: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    const pageSql = queryRaw.mock.calls[0][0].strings.join(' ');
    const querySql = queryRaw.mock.calls[1][0].strings.join(' ');
    expect(pageSql).toContain('SUM("position" * "impressions")');
    expect(querySql).toContain('SUM("position" * "impressions")');
    expect(result).toEqual([expect.objectContaining({
      page: 'https://www.geovault.app/cases',
      clicks: 0,
      impressions: 24,
      ctr: 0,
      position: 5.8,
      priority: 'high',
      reasonCodes: ['high_impressions_zero_clicks', 'page_one_low_ctr'],
      topQueries: [expect.objectContaining({
        query: 'GEO 成功案例',
        impressions: 24,
        position: 5.8,
      })],
    })]);
  });

  it('combines GA4 query-string variants before evaluating engagement', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page: 'https://www.geovault.app/cases',
        clicks: 2,
        impressions: 20,
        position: 7,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: {
        groupBy: jest.fn().mockResolvedValue([
          {
            landingPage: '/cases?utm_source=one',
            _sum: { sessions: 8, engagedSessions: 1, keyEvents: 0 },
          },
          {
            landingPage: '/cases?utm_source=two',
            _sum: { sessions: 7, engagedSessions: 2, keyEvents: 1 },
          },
        ]),
      },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      reasonCodes: ['low_engagement'],
      ga4: { sessions: 15, engagedSessions: 3, keyEvents: 1 },
    }));
  });

  it('keeps low-sample page-one and page-two rows in monitor status', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([
        {
          page: 'https://www.geovault.app/blog/low-sample-page-one',
          clicks: 0,
          impressions: 7,
          position: 8,
        },
        {
          page: 'https://www.geovault.app/blog/low-sample-page-two',
          clicks: 0,
          impressions: 5,
          position: 15,
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
      blogArticle: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result).toEqual([
      expect.objectContaining({
        page: 'https://www.geovault.app/blog/low-sample-page-one',
        priority: 'monitor',
        reasonCodes: [],
        suggestedAction: '持續累積資料，暫不做無差別重寫。',
      }),
      expect.objectContaining({
        page: 'https://www.geovault.app/blog/low-sample-page-two',
        priority: 'monitor',
        reasonCodes: [],
        suggestedAction: '持續累積資料，暫不做無差別重寫。',
      }),
    ]);
  });

  it('returns a matching action for a sufficiently sampled page-one low CTR', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page: 'https://www.geovault.app/cases',
        clicks: 1,
        impressions: 100,
        position: 7,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      priority: 'medium',
      reasonCodes: ['page_one_low_ctr'],
      suggestedAction: '核對搜尋摘要是否直接回答主要查詢，並調整 title、description 與首屏證據摘要。',
    }));
  });

  it('keeps a known non-indexable dynamic article out of the CTR repair queue', async () => {
    const page = 'https://www.geovault.app/blog/private-site-article';
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page,
        clicks: 0,
        impressions: 83,
        position: 22,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
      blogArticle: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ slug: 'private-site-article' }])
          .mockResolvedValueOnce([]),
      },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      page,
      currentlyIndexable: false,
      priority: 'monitor',
      reasonCodes: ['not_currently_indexable'],
      suggestedAction: '目前頁面不符合公開索引門檻；先確認應退役或補齊公開證據，不做 CTR 文案優化。',
    }));
  });

  it('applies the public article quality gate after the routable database filter', async () => {
    const page = 'https://www.geovault.app/blog/thin-article';
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page,
        clicks: 0,
        impressions: 25,
        position: 9,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
      blogArticle: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ slug: 'thin-article' }])
          .mockResolvedValueOnce([{
            slug: 'thin-article',
            title: '太短',
            description: '內容不足',
            templateType: 'brand_profile',
            site: null,
          }]),
      },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      currentlyIndexable: false,
      priority: 'monitor',
      reasonCodes: ['not_currently_indexable'],
    }));
  });

  it('uses current directory quality gates before recommending CTR work', async () => {
    const siteId = 'low-quality-directory-site';
    const page = `https://www.geovault.app/directory/${siteId}`;
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page,
        clicks: 0,
        impressions: 41,
        position: 39.5,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
      site: {
        findMany: jest.fn().mockResolvedValue([{
          id: siteId,
          name: '台北運動健身中心',
          url: 'https://www.tpegym.com.tw',
          industry: 'fitness',
          bestScore: 51,
          bestScoreAt: new Date(),
          profile: null,
          scans: [{
            completedAt: new Date(),
            results: [
              { indicator: 'JSON-LD', status: 'fail' },
              { indicator: 'Meta Description', status: 'fail' },
            ],
          }],
          _count: { qas: 0, blogArticles: 0 },
        }]),
      },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      page,
      currentlyIndexable: false,
      priority: 'monitor',
      reasonCodes: ['not_currently_indexable'],
    }));
  });

  it('uses ranking work instead of CTR work beyond page two', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        page: 'https://www.geovault.app/guide',
        clicks: 0,
        impressions: 40,
        position: 31,
      }])
      .mockResolvedValueOnce([]);
    const prisma = {
      $queryRaw: queryRaw,
      ga4LandingPageDaily: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const result = await new AnalyticsSyncService(prisma as any).opportunities(28);

    expect(result[0]).toEqual(expect.objectContaining({
      priority: 'medium',
      reasonCodes: ['ranking_beyond_page_two'],
      suggestedAction: '先核對搜尋意圖與內容事實，再補強可驗證主題內容、內部連結與來源，而不是只改搜尋摘要。',
    }));
  });

  it('records an empty upstream result distinctly from a healthy sync', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const service = new AnalyticsSyncService({
      analyticsSyncState: { update },
    } as any);

    await (service as any).markSuccess('ga4', 0);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'empty', lastRowCount: 0 }),
    }));
  });
});
