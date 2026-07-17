import { BadRequestException } from '@nestjs/common';
import {
  buildManualPublishPackage,
  markdownToPortableHtml,
} from './article-publish-package.service';

const article = {
  slug: 'acme-202607-sat-data-pulse-abcd',
  title: 'Acme 七月公開品牌資料整理',
  description: '整理 Acme 的官方服務、公開資料與常見問題，供讀者核對最新品牌資訊。',
  content: `# Acme 七月公開品牌資料整理

Acme 的官方網站是 https://www.acme.com，以下資料應以官網最新公告為準。

## 常見問題

**Q: Acme 提供什麼服務？**
A: Acme 提供公開品牌資料整理服務。

**Q: 如何確認最新資訊？**
A: 請查看 Acme 官方網站。

<script>alert('unsafe')</script>`,
  locale: 'zh-TW',
  createdAt: new Date('2026-07-10T00:00:00.000Z'),
  updatedAt: new Date('2026-07-17T00:00:00.000Z'),
  targetKeywords: ['Acme', 'sat_data_pulse'],
  site: {
    id: 'site-1',
    name: 'Acme',
    url: 'https://www.acme.com',
    industry: 'software',
  },
};

describe('manual article publishing package', () => {
  it('escapes raw HTML while keeping a portable article structure', () => {
    const html = markdownToPortableHtml(article.content);

    expect(html).toContain('<h1>Acme 七月公開品牌資料整理</h1>');
    expect(html).toContain('&lt;script&gt;alert');
    expect(html).not.toContain("<script>alert('unsafe')</script>");
  });

  it('builds CMS, JSON-LD and crawler guidance without automatic publishing', () => {
    const result = buildManualPublishPackage(
      article,
      'https://www.acme.com/knowledge/acme-july',
    );

    expect(result.officialSite.canonicalUrl).toBe(
      'https://www.acme.com/knowledge/acme-july',
    );
    expect(result.formats.cmsHtml).toContain('<article>');
    expect(result.formats.jsonLdScript).toContain('application/ld+json');
    expect(result.formats.jsonLd).toContain('FAQPage');
    expect(result.formats.sitemapXmlEntry).toContain(
      '<loc>https://www.acme.com/knowledge/acme-july</loc>',
    );
    expect(result.crawlerGuidance.requiresBackendSourceEdit).toBe(false);
    expect(result.updateMatrix.alwaysUpdate).toEqual(
      expect.arrayContaining([expect.stringContaining('sitemap')]),
    );
    expect(result.publicationWorkflow.map((phase) => phase.phase)).toEqual([
      'publish',
      'structure',
      'discover',
      'verify',
    ]);
    expect(result.verificationSteps.map((step) => step.id)).toEqual(
      expect.arrayContaining([
        'public-url',
        'source-html',
        'canonical',
        'article-schema',
        'faq-schema',
        'internal-link',
        'sitemap-robots',
      ]),
    );
    expect(result.verificationSteps.find((step) => step.id === 'faq-schema')?.required).toBe(true);
    expect(result.reviewReminder.intervalDays).toBe(7);
    expect(result.reviewReminder.nextReviewAt.toISOString()).toBe(
      '2026-07-24T00:00:00.000Z',
    );
  });

  it('rejects canonical URLs outside the customer official domain', () => {
    expect(() =>
      buildManualPublishPackage(article, 'https://attacker.example/article'),
    ).toThrow(BadRequestException);
  });
});
