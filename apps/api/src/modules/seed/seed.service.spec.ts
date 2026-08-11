import { SeedService } from './seed.service';

describe('SeedService quarantine', () => {
  const prisma = {
    site: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  let service: SeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SeedService(prisma as never, {} as never);
  });

  it('previews only low-score system-owned auto-discovery sites', async () => {
    prisma.site.findMany.mockResolvedValue([{ id: 'site-1' }, { id: 'site-2' }]);

    const result = await service.quarantineLowQualityPublicSeeds(true);

    expect(prisma.site.findMany).toHaveBeenCalledWith({
      where: {
        isPublic: true,
        isClient: false,
        bestScore: { lt: 60 },
        user: { is: { email: 'system@geovault.local' } },
        seedSource: { is: { status: 'scanned', source: 'auto_discovery' } },
      },
      select: { id: true },
    });
    expect(prisma.site.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ matched: 2, quarantined: 0, dryRun: true });
  });

  it('updates only the exact candidate IDs found by the guarded query', async () => {
    prisma.site.findMany.mockResolvedValue([{ id: 'site-1' }, { id: 'site-2' }]);
    prisma.site.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.quarantineLowQualityPublicSeeds(false);

    expect(prisma.site.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['site-1', 'site-2'] }, isPublic: true },
      data: { isPublic: false },
    });
    expect(result).toMatchObject({ matched: 2, quarantined: 2, dryRun: false });
  });
});
