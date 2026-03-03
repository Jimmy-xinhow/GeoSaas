import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CrawlerService {
  private logger = new Logger(CrawlerService.name);

  async crawl(url: string): Promise<{ html: string; statusCode: number; headers: Record<string, string>; loadTime: number }> {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://geo-saas.com/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });

      const html = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });

      return { html, statusCode: response.status, headers, loadTime: Date.now() - start };
    } catch (error) {
      this.logger.error(`Failed to crawl ${url}: ${error}`);
      throw error;
    }
  }

  async fetchLlmsTxt(url: string): Promise<string | null> {
    try {
      const base = new URL(url);
      const llmsUrl = `${base.protocol}//${base.host}/llms.txt`;
      const response = await fetch(llmsUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return response.text();
      return null;
    } catch {
      return null;
    }
  }
}
