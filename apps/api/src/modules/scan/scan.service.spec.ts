import { ScanService } from './scan.service';

describe('ScanService reliability', () => {
  function createService(prisma: any, pipeline: any = {}) {
    return new ScanService(prisma, pipeline, {} as any, undefined);
  }

  it('closes interrupted pending/running scans with explicit metadata', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = createService({ scan: { updateMany } });
    const now = new Date('2026-08-12T09:00:00.000Z');

    await expect(service.recoverInterruptedScans(now)).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { lt: new Date('2026-08-12T08:50:00.000Z') },
      },
      data: {
        status: 'FAILED',
        failureCode: 'interrupted',
        failureReason: 'Scan worker stopped before the scan completed',
        completedAt: now,
      },
    });
  });

  it('prioritizes clients and excludes a fresh public site admitted by an older scan', async () => {
    const now = Date.now();
    const completed = (daysAgo: number) => ({
      status: 'COMPLETED',
      createdAt: new Date(now - daysAgo * 86400000),
      completedAt: new Date(now - daysAgo * 86400000),
    });
    const create = jest.fn().mockImplementation(async ({ data }: any) => ({ id: `scan-${data.siteId}` }));
    const prisma = {
      site: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'fresh-public', name: 'Fresh Public', url: 'https://fresh.example', isClient: false, scans: [completed(1), completed(30)] },
          { id: 'stale-public', name: 'Stale Public', url: 'https://stale.example', isClient: false, scans: [completed(30)] },
          { id: 'client', name: 'Paid Client', url: 'https://client.example', isClient: true, scans: [completed(1)] },
        ]),
      },
      scan: { create },
    };
    const pipeline = { executeScan: jest.fn().mockResolvedValue(undefined) };
    const service = createService(prisma, pipeline);

    await expect(service.runWeeklyRefresh(1)).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skippedBackoff: 0,
    });
    expect(create).toHaveBeenCalledWith({ data: { siteId: 'client', status: 'PENDING' } });
    expect(pipeline.executeScan).toHaveBeenCalledWith('scan-client', 'https://client.example');
    expect(prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            NOT: {
              scans: {
                some: {
                  status: 'COMPLETED',
                  completedAt: { gte: expect.any(Date) },
                },
              },
            },
          }),
        ]),
      }),
    }));
  });
});
