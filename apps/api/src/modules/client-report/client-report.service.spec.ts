jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ClientReportService } from './client-report.service';

describe('ClientReportService baseline query sets', () => {
  function createService(prisma: any) {
    return new ClientReportService(prisma, {} as any, {} as any);
  }

  it('creates a baseline set for a client site from brand facts and FAQ questions', async () => {
    const created = jest.fn().mockResolvedValue({ id: 'new-set' });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const findMany = jest.fn().mockResolvedValue([
      { id: 'new-set', name: 'Client AI 驗收問題集', queries: [{ category: 'brand', question: '問題' }], reports: [] },
    ]);
    const prisma = {
      clientQuerySet: { findFirst, findMany, create: created },
      site: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'site-1',
          name: 'Client',
          url: 'https://example.com',
          isClient: true,
          profile: {
            services: '婚禮佈置,婚禮設計',
            location: '台北市,全台',
            targetAudiences: ['準新人'],
          },
          qas: [
            { category: 'brand', question: 'Client 有哪些服務？' },
            { category: 'industry', question: '如何選擇婚禮佈置？' },
          ],
        }),
      },
    };

    const result = await createService(prisma).getQuerySets('site-1');

    expect(created).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ siteId: 'site-1', name: 'Client AI 驗收問題集' }),
    }));
    const questions = created.mock.calls[0][0].data.queries;
    expect(questions.length).toBeGreaterThanOrEqual(8);
    expect(questions.some((q: any) => q.question === 'Client 有哪些服務？')).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('does not create a baseline set for a non-client site', async () => {
    const prisma = {
      clientQuerySet: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      site: {
        findUnique: jest.fn().mockResolvedValue({ id: 'site-2', isClient: false }),
      },
    };

    await createService(prisma).getQuerySets('site-2');

    expect(prisma.clientQuerySet.create).not.toHaveBeenCalled();
  });
});
