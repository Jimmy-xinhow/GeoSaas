import {
  buildBlogArticleContentKey,
  normalizeBlogArticleDescription,
  normalizeBlogArticleTitle,
} from './blog-article-normalization';

describe('blog article write normalization', () => {
  it('normalizes equivalent punctuation and spacing to the same identity', () => {
    const first = buildBlogArticleContentKey({
      siteId: 'site-1',
      title: '台北婚佈：完整指南',
      templateType: 'brand_profile',
    });
    const second = buildBlogArticleContentKey({
      siteId: 'site-1',
      title: ' 台北婚佈 - 完整指南 ',
      templateType: 'brand_profile',
    });

    expect(first).toBe(second);
    expect(normalizeBlogArticleTitle('Ａ B，C')).toBe('abc');
  });

  it('keeps different sites or content intents distinct', () => {
    const base = { title: '同一標題', templateType: 'brand_profile' };
    expect(buildBlogArticleContentKey({ ...base, siteId: 'site-1' }))
      .not.toBe(buildBlogArticleContentKey({ ...base, siteId: 'site-2' }));
    expect(buildBlogArticleContentKey({ ...base, siteId: 'site-1' }))
      .not.toBe(buildBlogArticleContentKey({ ...base, siteId: 'site-1', templateType: 'faq_deepdive' }));
  });

  it('stores a plain-text description capped at 160 characters', () => {
    const description = normalizeBlogArticleDescription(`## 摘要\n**${'公開資料'.repeat(60)}**`);
    expect(description).not.toMatch(/[#*]/);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
