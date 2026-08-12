import { SiteCmsContentService } from './site-cms-content.service';

describe('SiteCmsContentService', () => {
  const service = new SiteCmsContentService();

  it('keeps editorial HTML but removes active content', () => {
    const result = service.sanitizeRichHtml(
      '<h2 class="intro">標題</h2><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">連結</a><img src="https://cdn.example.com/a.webp" onerror="alert(1)">',
    );
    expect(result).toContain('<h2 class="intro">標題</h2>');
    expect(result).toContain('https://cdn.example.com/a.webp');
    expect(result).not.toMatch(/script|javascript:|onclick|onerror/i);
  });

  it('scopes safe CSS and strips page-level or active rules', () => {
    const result = service.sanitizeCss(`
      h2, .lead { color: #8b6b16; margin-bottom: 1rem; }
      body { background: red; }
      .hero { background-image: url(https://evil.example/a.png); position: fixed; color: blue; }
      @import url(https://evil.example/a.css);
    `);
    expect(result).toContain('.cms-article-content h2');
    expect(result).toContain('.cms-article-content .lead');
    expect(result).not.toMatch(/body|url\(|position|@import/i);
    expect(result).toContain('color: blue');
  });

  it('renders a safe preview and table of contents', () => {
    const result = service.renderPreview('## 第一段\n\n內容\n\n### 細節', 'markdown');
    expect(result.html).toContain('id="第一段"');
    expect(result.toc).toEqual([
      { id: '第一段', text: '第一段', level: 2 },
      { id: '細節', text: '細節', level: 3 },
    ]);
  });
});
