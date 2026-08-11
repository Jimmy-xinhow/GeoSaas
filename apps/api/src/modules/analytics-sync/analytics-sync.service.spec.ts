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
