import { ConfigService } from '@nestjs/config';
import { DEFAULT_SUPPORT_KNOWLEDGE } from './support-knowledge.defaults';
import { SupportIntegrationService } from './support-integration.service';
import { SupportRealtimeGateway } from './support-realtime.gateway';
import { SupportService } from './support.service';

describe('SupportService', () => {
  function createService(overrides: Partial<{ queryRaw: jest.Mock; executeRaw: jest.Mock; configGet: jest.Mock }> = {}) {
    const prisma = {
      $queryRaw: overrides.queryRaw || jest.fn().mockResolvedValue([]),
      $executeRaw: overrides.executeRaw || jest.fn().mockResolvedValue(1),
    };
    const realtime = { emitConversationUpdated: jest.fn() } as unknown as SupportRealtimeGateway;
    const config = {
      get: overrides.configGet || jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const integrations = {} as SupportIntegrationService;
    const service = new SupportService(prisma as any, realtime, config, integrations);
    return { service, prisma, config };
  }

  it('seeds default support knowledge when items are missing', async () => {
    const { service, prisma } = createService();

    const result = await service.seedDefaultKnowledge('admin_1');

    expect(result).toEqual({
      created: DEFAULT_SUPPORT_KNOWLEDGE.length,
      updated: 0,
      total: DEFAULT_SUPPORT_KNOWLEDGE.length,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(DEFAULT_SUPPORT_KNOWLEDGE.length);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(DEFAULT_SUPPORT_KNOWLEDGE.length);
  });

  it('refreshes existing default support knowledge instead of duplicating it', async () => {
    const { service, prisma } = createService({
      queryRaw: jest.fn().mockResolvedValue([{ id: 'knowledge_1' }]),
    });

    const result = await service.seedDefaultKnowledge('admin_1');

    expect(result).toEqual({
      created: 0,
      updated: DEFAULT_SUPPORT_KNOWLEDGE.length,
      total: DEFAULT_SUPPORT_KNOWLEDGE.length,
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(DEFAULT_SUPPORT_KNOWLEDGE.length);
  });

  it('skips automatic default knowledge sync when disabled', async () => {
    const { service, prisma } = createService({
      configGet: jest.fn((key: string) => (key === 'SUPPORT_DEFAULT_KNOWLEDGE_ENABLED' ? '0' : undefined)),
    });

    await service.onModuleInit();

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
