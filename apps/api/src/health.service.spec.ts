import { HealthService } from './health.service';

describe('HealthService', () => {
  const createService = () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const service = new HealthService(prisma as never);
    (service as any).redis = redis;
    return { service, prisma, redis };
  };

  it('reports ready only after both database and Redis checks pass', async () => {
    const { service } = createService();

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('fails readiness without leaking dependency error details', async () => {
    const { service, prisma } = createService();
    prisma.$queryRaw.mockRejectedValue(new Error('database-secret-detail'));

    const result = await service.readiness();

    expect(result).toMatchObject({
      status: 'error',
      checks: { database: 'error', redis: 'ok' },
    });
    expect(JSON.stringify(result)).not.toContain('database-secret-detail');
  });

  it('fails readiness when Redis is unavailable', async () => {
    const { service, redis } = createService();
    redis.ping.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'error',
      checks: { database: 'ok', redis: 'error' },
    });
  });
});
