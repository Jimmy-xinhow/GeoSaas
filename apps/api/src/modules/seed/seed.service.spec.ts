import { SeedService } from './seed.service';

describe('SeedService quarantine', () => {
  const prisma = {
    site: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const badgeService = { invalidateSvgBadge: jest.fn() };
  const llmsHosting = { invalidatePlatformLlmsFull: jest.fn() };

  let service: SeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    badgeService.invalidateSvgBadge.mockResolvedValue(undefined);
    llmsHosting.invalidatePlatformLlmsFull.mockResolvedValue(undefined);
    service = new SeedService(
      prisma as never,
      {} as never,
      badgeService as never,
      llmsHosting as never,
    );
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
    expect(badgeService.invalidateSvgBadge).not.toHaveBeenCalled();
    expect(llmsHosting.invalidatePlatformLlmsFull).not.toHaveBeenCalled();
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
    expect(badgeService.invalidateSvgBadge).toHaveBeenCalledTimes(2);
    expect(badgeService.invalidateSvgBadge).toHaveBeenCalledWith('site-1');
    expect(badgeService.invalidateSvgBadge).toHaveBeenCalledWith('site-2');
    expect(llmsHosting.invalidatePlatformLlmsFull).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ matched: 2, quarantined: 2, dryRun: false });
  });
});
