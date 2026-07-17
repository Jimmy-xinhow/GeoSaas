import {
  auditPublishedArticleShadow,
  isLegacyGeoGenerationEnabled,
  isLegacyGeoTemplate,
} from './legacy-geo-content-audit';

describe('legacy GEO generation guard and shadow audit', () => {
  it('keeps legacy generation frozen unless the operator explicitly sets 1', () => {
    expect(isLegacyGeoGenerationEnabled(undefined)).toBe(false);
    expect(isLegacyGeoGenerationEnabled('0')).toBe(false);
    expect(isLegacyGeoGenerationEnabled('true')).toBe(false);
    expect(isLegacyGeoGenerationEnabled('1')).toBe(true);
  });

  it('recognizes all legacy factory templates', () => {
    expect(isLegacyGeoTemplate('geo_overview')).toBe(true);
    expect(isLegacyGeoTemplate('brand_reputation')).toBe(true);
    expect(isLegacyGeoTemplate('client_daily')).toBe(false);
  });

  it('flags self-rated legacy content without changing it', () => {
    expect(
      auditPublishedArticleShadow({
        templateType: 'geo_overview',
        title: 'Acme GEO 分數分析',
        content: '這篇文章說明 Acme 的 AI 能見度。',
      }),
    ).toEqual(
      expect.arrayContaining([
        'legacy_template_requires_replacement',
        'legacy_self_rating_language',
        'legacy_missing_verifiable_source',
      ]),
    );
  });

  it('does not treat a historical success case as legacy factory content', () => {
    expect(
      auditPublishedArticleShadow({
        templateType: 'geo_overview',
        category: 'case-study',
        title: '客戶成功案例',
        content: '資料來自客戶提交。',
      }),
    ).toEqual([]);
  });

  it('flags medical claims in medical-adjacent brand showcase content', () => {
    expect(
      auditPublishedArticleShadow({
        templateType: 'brand_showcase',
        title: '某整復品牌介紹',
        content: '本服務保證改善疼痛。',
        site: { industry: 'traditional_medicine' },
      }),
    ).toContain('medical_claim_review_required');
  });

  it('does not flag normal client_daily source content', () => {
    expect(
      auditPublishedArticleShadow({
        templateType: 'client_daily',
        title: 'Acme 本週公開資料',
        content: '## 資料來源\n- 官方網站：https://acme.example',
        site: { industry: 'software' },
      }),
    ).toEqual([]);
  });
});
