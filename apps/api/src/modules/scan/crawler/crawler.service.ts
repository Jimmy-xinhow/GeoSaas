import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CrawlerService {
  private logger = new Logger(CrawlerService.name);

  async crawl(url: string): Promise<{ html: string; statusCode: number; headers: Record<string, string>; loadTime: number }> {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://geovault.app/bot)',
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

  async fetchRobotsTxt(url: string): Promise<string | null> {
    try {
      const base = new URL(url);
      const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://geovault.app/bot)' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return res.text();
      return null;
    } catch {
      return null;
    }
  }

  async fetchLlmsTxt(url: string): Promise<string | null> {
    try {
      // Try 1: same directory as the URL (for subdirectory sites like GitHub Pages)
      const baseUrl = url.endsWith('/') ? url : url + '/';
      const sameDir = await fetch(`${baseUrl}llms.txt`, { signal: AbortSignal.timeout(5000) });
      if (sameDir.ok) {
        const text = await sameDir.text();
        if (text.includes('#') || text.length > 20) return text;
      }

      // Try 2: root domain (traditional location)
      const base = new URL(url);
      const rootUrl = `${base.protocol}//${base.host}/llms.txt`;
      if (rootUrl !== `${baseUrl}llms.txt`) {
        const rootRes = await fetch(rootUrl, { signal: AbortSignal.timeout(5000) });
        if (rootRes.ok) return rootRes.text();
      }

      return null;
    } catch {
      return null;
    }
  }
}
