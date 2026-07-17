import { GeoGrowthPlanService } from './geo-growth-plan.service';

describe('GeoGrowthPlanService', () => {
  const siteId = 'site-1';
  const userId = 'user-1';
  const now = new Date('2026-07-17T08:00:00.000Z');

  const sitesService = {
    findOne: jest.fn(),
  };
  const prisma = {
    scan: { findFirst: jest.fn() },
    siteQa: { count: jest.fn() },
    officialSiteArticle: { findMany: jest.fn() },
    articleQualityLog: { findMany: jest.fn() },
    clientQuerySet: { count: jest.fn() },
    monitorReport: { findFirst: jest.fn() },
    monitor: { count: jest.fn(), findFirst: jest.fn() },
    crawlerVisit: { count: jest.fn() },
    blogArticle: { count: jest.fn() },
  };

  let service: GeoGrowthPlanService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    sitesService.findOne.mockResolvedValue({
      id: siteId,
      name: 'Acme',
      url: 'https://acme.example',
      llmsTxt: null,
      profile: {},
    });
    prisma.scan.findFirst.mockResolvedValue(null);
    prisma.siteQa.count.mockResolvedValue(0);
    prisma.officialSiteArticle.findMany.mockResolvedValue([]);
    prisma.articleQualityLog.findMany.mockResolvedValue([]);
    prisma.clientQuerySet.count.mockResolvedValue(0);
    prisma.monitorReport.findFirst.mockResolvedValue(null);
    prisma.monitor.count.mockResolvedValue(0);
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.crawlerVisit.count.mockResolvedValue(0);
    prisma.blogArticle.count.mockResolvedValue(0);
    service = new GeoGrowthPlanService(prisma as any, sitesService as any);
  });

  afterEach(() => jest.useRealTimers());

  it('starts with a scan instead of guessing a later action', async () => {
    const plan = await service.getPlan(siteId, userId, 'USER');

    expect(sitesService.findOne).toHaveBeenCalledWith(siteId, userId, 'USER');
    expect(plan.progress).toBe(0);
    expect(plan.currentStageKey).toBe('diagnose');
    expect(plan.nextAction.action).toBe('scan');
    expect(plan.stages[0].status).toBe('current');
    expect(plan.stages.slice(1).every((stage) => stage.status === 'upcoming')).toBe(true);
  });

  it('uses scan, brand facts, official content and reports to choose the real next step', async () => {
    sitesService.findOne.mockResolvedValue({
      id: siteId,
      name: 'Acme',
      url: 'https://acme.example',
      llmsTxt: '# Acme',
      profile: {
        location: 'Taipei',
        services: 'B2B software',
        positioning: 'Workflow automation',
        contact: 'https://acme.example/contact',
        targetAudiences: ['operations teams'],
        notFor: ['personal use'],
      },
    });
    prisma.scan.findFirst.mockResolvedValue({
      totalScore: 92,
      completedAt: now,
      results: [{ status: 'pass' }, { status: 'warning' }],
    });
    prisma.siteQa.count.mockResolvedValue(8);
    prisma.crawlerVisit.count.mockResolvedValue(4);
    prisma.articleQualityLog.findMany.mockResolvedValue([
      { passed: true, totalScore: 94 },
      { passed: false, totalScore: 76 },
    ]);

    const plan = await service.getPlan(siteId, userId);

    expect(plan.currentStageKey).toBe('content');
    expect(plan.progress).toBe(60);
    expect(plan.quality.factConfidence).toBe(100);
    expect(plan.quality.latestArticleScore).toBe(94);
    expect(plan.quality.autoRepairAttempts30d).toBe(1);
    expect(plan.nextAction.href).toBe(`/sites/${siteId}/official-content`);
  });

  it('moves to measurement only after a high-quality official article is approved', async () => {
    sitesService.findOne.mockResolvedValue({
      id: siteId,
      name: 'Acme',
      url: 'https://acme.example',
      llmsTxt: '# Acme',
      profile: {
        location: 'Taipei',
        services: 'B2B software',
        positioning: 'Workflow automation',
        contact: 'https://acme.example/contact',
        targetAudiences: ['operations teams'],
        notFor: ['personal use'],
      },
    });
    prisma.scan.findFirst.mockResolvedValue({
      totalScore: 96,
      completedAt: now,
      results: [{ status: 'pass' }],
    });
    prisma.siteQa.count.mockResolvedValue(6);
    prisma.crawlerVisit.count.mockResolvedValue(1);
    prisma.officialSiteArticle.findMany.mockResolvedValue([
      { status: 'approved', qualityReport: { score: 100 }, publishedUrl: null },
      { status: 'quality_failed', qualityReport: { score: 77 }, publishedUrl: null },
    ]);

    const plan = await service.getPlan(siteId, userId);

    expect(plan.currentStageKey).toBe('measurement');
    expect(plan.quality.officialApprovedCount).toBe(1);
    expect(plan.quality.officialFailedCount).toBe(1);
    expect(plan.quality.latestArticleScore).toBe(100);
    expect(plan.nextAction.href).toBe(`/sites/${siteId}/monitor`);
  });
});
