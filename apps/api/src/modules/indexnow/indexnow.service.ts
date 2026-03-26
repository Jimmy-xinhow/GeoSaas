import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface IndexNowResult {
  engine: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

@Injectable()
export class IndexNowService {
  private readonly logger = new Logger(IndexNowService.name);
  private readonly apiKey: string;
  private readonly engines = [
    'https://api.indexnow.org/indexnow',
    'https://www.bing.com/indexnow',
    'https://yandex.com/indexnow',
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>('INDEXNOW_API_KEY', 'geo-saas-indexnow-key');
  }

  /** Submit a single URL to all IndexNow engines */
  async submitUrl(url: string): Promise<IndexNowResult[]> {
    const host = new URL(url).host;
    const results: IndexNowResult[] = [];

    for (const engine of this.engines) {
      try {
        const params = new URLSearchParams({
          url,
          key: this.apiKey,
        });
        const res = await fetch(`${engine}?${params}`, { method: 'GET' });
        results.push({
          engine: new URL(engine).hostname,
          success: res.status >= 200 && res.status < 300,
          statusCode: res.status,
        });
      } catch (error) {
        results.push({
          engine: new URL(engine).hostname,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(`IndexNow submitted ${url}: ${results.filter((r) => r.success).length}/${results.length} success`);
    return results;
  }

  /** Submit multiple URLs in batch */
  async submitBatch(urls: string[], host: string): Promise<IndexNowResult[]> {
    const results: IndexNowResult[] = [];

    for (const engine of this.engines) {
      try {
        const body = {
          host,
          key: this.apiKey,
          urlList: urls.slice(0, 10000), // IndexNow max 10k per batch
        };
        const res = await fetch(engine, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        results.push({
          engine: new URL(engine).hostname,
          success: res.status >= 200 && res.status < 300,
          statusCode: res.status,
        });
      } catch (error) {
        results.push({
          engine: new URL(engine).hostname,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(`IndexNow batch submitted ${urls.length} URLs: ${results.filter((r) => r.success).length}/${results.length} success`);
    return results;
  }

  /** Get the API key for serving the verification file */
  getApiKey(): string {
    return this.apiKey;
  }
}
