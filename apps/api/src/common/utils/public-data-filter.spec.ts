import {
  getPublicSuccessCaseSeoIssues,
  isIndexablePublicSuccessCase,
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
