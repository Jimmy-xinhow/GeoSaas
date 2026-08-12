import {
  countCoreGeoFailures,
  getDirectorySiteSeoIssues,
  getPublicSuccessCaseSeoIssues,
  isIndexablePublicSuccessCase,
  normalizePublicSiteName,
  publicIndexableBlogArticleWhere,
  publicRoutableBlogArticleWhere,
  publicSuccessCaseWhere,
} from './public-data-filter';

const baseCase = {
  title: '品牌透過 GEO 優化後被 AI 引用的案例',
  queryUsed: '台北專業服務推薦有哪些？',
  aiResponse: '這是一段足夠完整的 AI 回應摘要，用來證明案例具備足夠內容，而不是只有短句。品牌服務、推薦原因、適用情境與來源都在摘要中清楚說明。'.repeat(2),
  site: { name: '正式品牌', url: 'https://brand.example.tw', isPublic: true },
};

describe('public success case evidence gate', () => {
  it('rejects an approved-looking case without citation evidence', () => {
    const item = { ...baseCase, screenshotUrl: null };

    expect(getPublicSuccessCaseSeoIssues(item)).toContain('missing-citation-evidence');
    expect(isIndexablePublicSuccessCase(item)).toBe(false);
  });

  it('accepts a content-complete case with citation evidence', () => {
    const item = {
      ...baseCase,
      screenshotUrl: 'https://cdn.example.tw/cases/evidence.png',
    };

    expect(getPublicSuccessCaseSeoIssues(item)).toEqual([]);
    expect(isIndexablePublicSuccessCase(item)).toBe(true);
  });

  it('pushes the evidence requirement into the public database filter', () => {
    expect(publicSuccessCaseWhere({ status: 'approved' })).toEqual(expect.objectContaining({
      AND: expect.arrayContaining([{ screenshotUrl: { not: null } }]),
    }));
  });
});

describe('public blog and directory routing boundaries', () => {
  it('requires linked sites to be public and articles to be active', () => {
    const routable = JSON.stringify(publicRoutableBlogArticleWhere({ published: true }));
    const indexable = JSON.stringify(publicIndexableBlogArticleWhere({ published: true }));

    expect(routable).toContain('"retiredAt":null');
    expect(routable).toContain('"isPublic":true');
    expect(indexable).toContain('"retiredAt":null');
    expect(indexable).toContain('"isPublic":true');
    expect(indexable).toContain('"templateType"');
  });

  it('normalizes an official brand name before evaluating editorial title noise', () => {
    const rawName = '台北運動健身中心: 台北24hr健身房、中山區計時健身房/計次 ...';

    expect(normalizePublicSiteName(rawName)).toBe('台北運動健身中心');
    expect(getDirectorySiteSeoIssues({
      name: rawName,
      url: 'https://www.tpegym.com.tw',
      industry: 'fitness',
      bestScore: 80,
      bestScoreAt: new Date(),
      latestScanCompletedAt: new Date(),
      profile: { description: '官方網站提供二十四小時健身、分鐘計費、計次方案、私人教練與包月自主訓練等公開資訊。' },
      qasCount: 2,
      blogArticlesCount: 0,
      coreGeoFailuresCount: 0,
    })).not.toContain('editorial-title-name');
  });

  it('uses the same core GEO failure count for detail pages and sitemap gates', () => {
    expect(countCoreGeoFailures({
      results: [
        { indicator: 'JSON-LD', status: 'fail' },
        { indicator: 'Meta Description', status: 'fail' },
        { indicator: 'OG Tags', status: 'fail' },
        { indicator: 'llms.txt', status: 'pass' },
      ],
    })).toBe(2);
  });
});
