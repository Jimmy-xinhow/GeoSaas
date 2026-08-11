jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

import { CrawlerService } from './crawler.service';
import { ScanExecutionError } from '../scan-failure';

describe('CrawlerService', () => {
  let service: CrawlerService;

  beforeEach(() => {
    service = new CrawlerService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries a transient server error once and returns valid HTML', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(
        new Response('<html><body>ok</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );

    const result = await service.crawl('https://example.com');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('<body>ok</body>');
  });

  it('does not score a permanent HTTP error page as a completed scan', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('<html>blocked</html>', { status: 403 }));

    await expect(service.crawl('https://example.com')).rejects.toMatchObject<
      Partial<ScanExecutionError>
    >({ code: 'http_4xx', statusCode: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTML responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(service.crawl('https://example.com')).rejects.toMatchObject<
      Partial<ScanExecutionError>
    >({ code: 'non_html' });
  });

  it('stops reading HTML once the response exceeds the byte limit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('x'.repeat(5 * 1024 * 1024 + 1), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(service.crawl('https://example.com')).rejects.toMatchObject<
      Partial<ScanExecutionError>
    >({ code: 'body_too_large' });
  });

  it('validates every redirect target before following it', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }),
    );

    await expect(service.crawl('https://example.com')).rejects.toMatchObject<
      Partial<ScanExecutionError>
    >({ code: 'blocked_target' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
