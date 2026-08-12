import { SnippetGeneratorService } from './snippet-generator.service';

describe('SnippetGeneratorService', () => {
  it('uses a cross-origin image beacon without widening credentialed CORS', () => {
    const config = {
      get: jest.fn().mockReturnValue('https://api.geovault.app'),
    };
    const service = new SnippetGeneratorService(config as any);

    const snippet = service.generate(
      'site-1',
      'abcdefghijklmnop',
      'https://example.com/path?a=1',
    );

    expect(snippet).toContain("new Image()");
    expect(snippet).toContain('/api/crawler/pixel/abcdefghijklmnop.gif?u=');
    expect(snippet).toContain('encodeURIComponent(window.location.href)');
    expect(snippet).toContain(encodeURIComponent('https://example.com/path?a=1'));
    expect(snippet).not.toContain('XMLHttpRequest');
    expect(snippet).not.toContain('fetch(');
    expect(snippet).not.toContain('Google-Extended');
  });
});
