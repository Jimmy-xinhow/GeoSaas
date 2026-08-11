import { Injectable, Logger } from '@nestjs/common';
import { ScanExecutionError } from '../scan-failure';
import { assertSafeScanUrl } from './scan-url-safety';

const SCANNER_USER_AGENT = 'GEO-SaaS-Scanner/1.0 (+https://www.geovault.app/bot)';
const CRAWL_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_AUXILIARY_TEXT_BYTES = 1024 * 1024;
const MAX_CRAWL_ATTEMPTS = 2;
const MAX_REDIRECTS = 5;

@Injectable()
export class CrawlerService {
  private logger = new Logger(CrawlerService.name);

  async crawl(url: string): Promise<{ html: string; statusCode: number; headers: Record<string, string>; loadTime: number }> {
    const start = Date.now();
    if (this.shouldUseE2EFixture(url)) {
      return {
        html: this.buildE2EFixtureHtml(url),
        statusCode: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        loadTime: Date.now() - start,
      };
    }

    let lastError: ScanExecutionError | null = null;
    for (let attempt = 1; attempt <= MAX_CRAWL_ATTEMPTS; attempt += 1) {
      try {
        return await this.crawlOnce(url, start);
      } catch (error) {
        const failure = this.toCrawlError(error);
        lastError = failure;
        const retryable = ['timeout', 'network', 'http_5xx', 'rate_limited'].includes(
          failure.code,
        );
        if (!retryable || attempt === MAX_CRAWL_ATTEMPTS) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }

    this.logger.warn(
      `Failed to crawl ${url}: ${lastError?.code ?? 'unexpected'} ${lastError?.message ?? ''}`,
    );
    throw lastError ?? new ScanExecutionError('unexpected', 'Unexpected crawl failure');
  }

  async fetchRobotsTxt(url: string): Promise<string | null> {
    if (this.shouldUseE2EFixture(url)) {
      return 'User-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n';
    }

    try {
      const base = new URL(url);
      const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
      const res = await this.fetchWithSafeRedirects(robotsUrl, 'text/plain', 5_000);
      if (res.ok) {
        return this.readBodyWithLimit(res, MAX_AUXILIARY_TEXT_BYTES, 'Auxiliary text');
      }
      return null;
    } catch {
      return null;
    }
  }

  async fetchLlmsTxt(url: string): Promise<string | null> {
    if (this.shouldUseE2EFixture(url)) {
      return '# E2E Fixture Site\n\nThis is a deterministic llms.txt fixture for Playwright scans.';
    }

    try {
      // Try 1: same directory as the URL (for subdirectory sites like GitHub Pages)
      const baseUrl = url.endsWith('/') ? url : url + '/';
      const sameDir = await this.fetchWithSafeRedirects(
        `${baseUrl}llms.txt`,
        'text/plain',
        5_000,
      );
      if (sameDir.ok) {
        const text = await this.readBodyWithLimit(
          sameDir,
          MAX_AUXILIARY_TEXT_BYTES,
          'Auxiliary text',
        );
        if (text.includes('#') || text.length > 20) return text;
      }

      // Try 2: root domain (traditional location)
      const base = new URL(url);
      const rootUrl = `${base.protocol}//${base.host}/llms.txt`;
      if (rootUrl !== `${baseUrl}llms.txt`) {
        const rootRes = await this.fetchWithSafeRedirects(rootUrl, 'text/plain', 5_000);
        if (rootRes.ok) {
          return this.readBodyWithLimit(
            rootRes,
            MAX_AUXILIARY_TEXT_BYTES,
            'Auxiliary text',
          );
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private shouldUseE2EFixture(url: string): boolean {
    if (process.env.E2E !== '1') return false;
    try {
      return new URL(url).hostname.endsWith('.example.com');
    } catch {
      return false;
    }
  }

  private async crawlOnce(
    url: string,
    startedAt: number,
  ): Promise<{
    html: string;
    statusCode: number;
    headers: Record<string, string>;
    loadTime: number;
  }> {
    let response: Response;
    try {
      response = await this.fetchWithSafeRedirects(url);
    } catch (error) {
      throw this.toCrawlError(error);
    }

    if (response.status === 429) {
      throw new ScanExecutionError(
        'rate_limited',
        'Target rate-limited the scanner with HTTP 429',
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new ScanExecutionError(
        'http_5xx',
        `Target returned HTTP ${response.status}`,
        response.status,
      );
    }
    if (response.status >= 400 || response.status < 200) {
      throw new ScanExecutionError(
        'http_4xx',
        `Target returned HTTP ${response.status}`,
        response.status,
      );
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new ScanExecutionError(
        'non_html',
        `Target returned unsupported content type ${contentType.split(';')[0]}`,
      );
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
      throw new ScanExecutionError(
        'body_too_large',
        `Target HTML exceeds the ${MAX_HTML_BYTES}-byte scan limit`,
      );
    }

    const html = await this.readHtmlWithLimit(response);
    if (!html.trim()) {
      throw new ScanExecutionError('empty_body', 'Target returned an empty HTML document');
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      html,
      statusCode: response.status,
      headers,
      loadTime: Date.now() - startedAt,
    };
  }

  private async fetchWithSafeRedirects(
    initialUrl: string,
    accept = 'text/html,application/xhtml+xml',
    timeoutMs = CRAWL_TIMEOUT_MS,
  ): Promise<Response> {
    let currentUrl = initialUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertSafeScanUrl(currentUrl);
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': SCANNER_USER_AGENT,
          Accept: accept,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status < 300 || response.status >= 400) return response;

      const location = response.headers.get('location');
      if (!location) {
        throw new ScanExecutionError(
          'http_4xx',
          `Target returned HTTP ${response.status} without a redirect location`,
          response.status,
        );
      }
      if (redirects === MAX_REDIRECTS) {
        throw new ScanExecutionError(
          'redirect_limit',
          `Target exceeded the ${MAX_REDIRECTS}-redirect scan limit`,
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
    }

    throw new ScanExecutionError('redirect_limit', 'Target exceeded the redirect scan limit');
  }

  private async readHtmlWithLimit(response: Response): Promise<string> {
    return this.readBodyWithLimit(response, MAX_HTML_BYTES, 'Target HTML');
  }

  private async readBodyWithLimit(
    response: Response,
    maxBytes: number,
    label: string,
  ): Promise<string> {
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new ScanExecutionError(
            'body_too_large',
            `${label} exceeds the ${maxBytes}-byte scan limit`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(body);
  }

  private toCrawlError(error: unknown): ScanExecutionError {
    if (error instanceof ScanExecutionError) return error;
    const message = error instanceof Error ? error.message.toLowerCase() : String(error);
    if (
      (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ||
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return new ScanExecutionError(
        'timeout',
        `Target did not respond within ${CRAWL_TIMEOUT_MS / 1000} seconds`,
      );
    }
    return new ScanExecutionError('network', 'Target could not be reached over the network');
  }

  private buildE2EFixtureHtml(url: string): string {
    const host = new URL(url).hostname;
    return `<!doctype html>
<html lang="en">
<head>
  <title>${host} | E2E Fixture</title>
  <meta name="description" content="Deterministic E2E fixture page for GEO scan tests.">
  <meta property="og:title" content="${host} E2E Fixture">
  <meta property="og:description" content="A stable page used by Playwright scan tests.">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Organization","name":"${host}","url":"${url}"}
  </script>
</head>
<body>
  <main>
    <h1>${host}</h1>
    <p>Contact: hello@${host}</p>
    <img src="/logo.png" alt="${host} logo">
  </main>
</body>
</html>`;
  }
}
