import { SearchEnginePushService } from './search-engine-push.service';

describe('SearchEnginePushService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not call Google Indexing API for general directory pages', async () => {
    const service = new SearchEnginePushService(
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await (service as any).pushToGoogle();

    expect(result).toEqual({
      submitted: 0,
      skipped: 'unsupported_for_general_pages',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
