import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LlmsHostingService } from './llms-hosting.service';

/**
 * Keep the platform-level llms-full.txt response always-warm.
 *
 * The cache (in-memory + Redis) has a 30-min TTL. Without warming, a crawler
 * arriving on a cold cache pays the full DB build (~10s — observed 12.4s in
 * production), which is past most AI bot timeouts. Bots that time out reduce
 * crawl frequency to that origin.
 *
 * Firing every 20 min (cron expression in @Cron below → :00, :20, :40) keeps
 * both layers inside their TTL with a 10-min margin. The service's own logic decides
 * whether the call is a cache hit (cheap no-op) or a rebuild — we don't need
 * to force-invalidate.
 */
@Injectable()
export class LlmsHostingSchedulerService {
  private readonly logger = new Logger(LlmsHostingSchedulerService.name);

  constructor(private readonly service: LlmsHostingService) {}

  @Cron('*/20 * * * *')
  async warmLlmsFullTxt(): Promise<void> {
    const t0 = Date.now();
    try {
      const { content } = await this.service.getPlatformLlmsFullTxt();
      const ms = Date.now() - t0;
      // ≤50ms = cache hit; ≥1000ms = rebuild from DB. Log only rebuilds so
      // the log line tells us when the cache actually went cold.
      if (ms >= 1000) {
        this.logger.log(`llms-full warmed (rebuilt) in ${ms}ms — ${content.length} bytes`);
      }
    } catch (err) {
      this.logger.warn(`llms-full warm failed: ${err}`);
    }
  }
}
