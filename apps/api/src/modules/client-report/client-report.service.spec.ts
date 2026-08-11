jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ClientReportService } from './client-report.service';

describe('ClientReportService acceptance query sets', () => {
  const qaItems = Array.from({ length: 100 }, (_, index) => ({
    category: `category-${Math.floor(index / 10) + 1}`,
    question: `Client acceptance question ${index + 1}?`,
  }));

  function createService(prisma: any) {
    return new ClientReportService(prisma, {} as any, {} as any);
  }

  function clientSite(overrides: Record<string, unknown> = {}) {
    return {
      id: 'site-1',
      name: 'Client',
      url: 'https://example.com',
      isClient: true,
      profile: {},
      qas: qaItems,
      ...overrides,
    };
  }

  it('creates a 100-question generated set from persisted FAQ questions', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'new-set' });
    const prisma = {
      clientQuerySet: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([]),
        create,
        update: jest.fn(),
      },
      site: { findUnique: jest.fn().mockResolvedValue(clientSite()) },
    };

    await createService(prisma).getQuerySets('site-1');

    const questions = create.mock.calls[0][0].data.queries;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ siteId: 'site-1', name: 'Client AI 驗收問題集' }),
    }));
    expect(questions).toHaveLength(100);
    expect(questions[0]).toEqual(qaItems[0]);
    expect(questions[99]).toEqual(qaItems[99]);
  });

  it('expands an undersized generated set with unique FAQs and saved baseline questions', async () => {
    const savedBaseline = [
      { category: 'brand', question: 'Saved baseline brand question?' },
      { category: 'local', question: 'Saved baseline local question?' },
    ];
    const update = jest.fn().mockResolvedValue({ id: 'generated-set' });
    const prisma = {
      clientQuerySet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'generated-set',
          name: 'Client AI 驗收問題集',
          queries: [...savedBaseline, ...qaItems.slice(0, 18)],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update,
      },
      site: {
        findUnique: jest.fn().mockResolvedValue(clientSite({ qas: qaItems.slice(0, 98) })),
      },
    };

    await createService(prisma).getQuerySets('site-1');

    const questions = update.mock.calls[0][0].data.queries;
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'generated-set' },
    }));
    expect(questions).toHaveLength(100);
    expect(questions.slice(98)).toEqual(savedBaseline);
    expect(prisma.clientQuerySet.create).not.toHaveBeenCalled();
  });

  it('does not overwrite an intentionally named manual set', async () => {
    const prisma = {
      clientQuerySet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'manual-set',
          name: 'Client custom acceptance set',
          queries: qaItems.slice(0, 20),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      site: { findUnique: jest.fn().mockResolvedValue(clientSite()) },
    };

    await createService(prisma).getQuerySets('site-1');

    expect(prisma.clientQuerySet.update).not.toHaveBeenCalled();
    expect(prisma.clientQuerySet.create).not.toHaveBeenCalled();
  });

  it('does not create a generated set for a non-client site', async () => {
    const prisma = {
      clientQuerySet: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      site: { findUnique: jest.fn().mockResolvedValue({ id: 'site-2', isClient: false }) },
    };

    await createService(prisma).getQuerySets('site-2');

    expect(prisma.clientQuerySet.create).not.toHaveBeenCalled();
  });

  it('preserves an older completed report when the query set has expanded', async () => {
    const oldReport = {
      id: 'old-report',
      status: 'completed',
      createdAt: new Date(),
      results: Array.from({ length: 100 }, () => ({})),
    };
    const prisma = {
      clientQuerySet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'set-1',
          siteId: 'site-1',
          queries: qaItems,
          site: { id: 'site-1', name: 'Client', url: 'https://example.com', userId: 'admin-1' },
        }),
      },
      monitorReport: {
        findFirst: jest.fn().mockResolvedValueOnce(oldReport).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: 'new-report' }),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', plan: 'PRO', role: 'ADMIN' }),
      },
    };
    const service = createService(prisma);
    (service as any).executeReport = jest.fn().mockResolvedValue(undefined);

    const result = await service.runReport('set-1', 'ADMIN', 'admin-1');

    expect(result).toEqual({ reportId: 'new-report' });
    expect(prisma.monitorReport.delete).not.toHaveBeenCalled();
    expect(prisma.monitorReport.create).toHaveBeenCalled();
  });
});
