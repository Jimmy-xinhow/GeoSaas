import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from './prisma/prisma.service';

type DependencyStatus = 'ok' | 'error';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly startedAt = Date.now();
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {}

  liveness() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async readiness() {
    const startedAt = Date.now();
    const [database, redis] = await Promise.all([
      this.checkDependency(() => this.prisma.$queryRaw`SELECT 1`),
      this.checkDependency(() => this.pingRedis()),
    ]);
    const ready = database === 'ok' && redis === 'ok';

    return {
      status: ready ? ('ok' as const) : ('error' as const),
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks: { database, redis },
    };
  }

  async onModuleDestroy() {
    if (!this.redis) return;
    if (this.redis.status === 'ready') {
      await this.redis.quit().catch(() => this.redis?.disconnect());
      return;
    }
    this.redis.disconnect();
  }

  private async checkDependency(check: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await check();
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async pingRedis(): Promise<unknown> {
    if (!this.redis || this.redis.status === 'end') {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        lazyConnect: true,
        connectTimeout: 2_000,
        commandTimeout: 2_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
    }
    if (this.redis.status === 'wait') await this.redis.connect();
    return this.redis.ping();
  }
}
