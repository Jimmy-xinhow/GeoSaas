import { IndexNowService } from './indexnow.service';

describe('IndexNowService ownership proof', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createService() {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'INDEXNOW_API_KEY' ? 'unique-indexnow-key-1234' : fallback),
    };
    return new IndexNowService(config as any, {} as any);
  }

  it('sends an explicit same-origin keyLocation for a single URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock as any;

    await createService().submitUrl('https://www.geovault.app/blog/what-is-geo');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [requestUrl] of fetchMock.mock.calls) {
      const parsed = new URL(requestUrl);
      expect(parsed.searchParams.get('keyLocation')).toBe(
        'https://www.geovault.app/unique-indexnow-key-1234.txt',
      );
      expect(parsed.searchParams.get('url')).toBe(
        'https://www.geovault.app/blog/what-is-geo',
      );
    }
  });

  it('sends the same-origin keyLocation in batch payloads', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 202 });
    global.fetch = fetchMock as any;
    const urls = [
      'https://www.geovault.app/llms.txt',
      'https://www.geovault.app/sitemap.xml',
    ];

    await createService().submitBatch(urls, 'www.geovault.app');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) {
      expect(JSON.parse(options.body)).toEqual({
        host: 'www.geovault.app',
        key: 'unique-indexnow-key-1234',
        keyLocation: 'https://www.geovault.app/unique-indexnow-key-1234.txt',
        urlList: urls,
      });
    }
  });
});
