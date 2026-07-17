export const LEGACY_GEO_GENERATION_ENV = 'LEGACY_GEO_BULK_ENABLED';

export const LEGACY_GEO_TEMPLATE_TYPES = [
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_reputation',
] as const;

export const QUALITY_GATED_TEMPLATE_TYPES = [
  'brand_profile',
  'faq_deepdive',
  'client_daily',
  'brand_showcase',
  'industry_top10',
  'buyer_guide',
] as const;

export type LegacyGeoTemplateType = (typeof LEGACY_GEO_TEMPLATE_TYPES)[number];

export interface ContentShadowAuditInput {
  templateType: string;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  site?: {
    name?: string | null;
    url?: string | null;
    industry?: string | null;
  } | null;
}

export function isLegacyGeoGenerationEnabled(value: unknown): boolean {
  return String(value ?? '').trim() === '1';
}

export function isLegacyGeoTemplate(templateType: string): templateType is LegacyGeoTemplateType {
  return (LEGACY_GEO_TEMPLATE_TYPES as readonly string[]).includes(templateType);
}

/**
 * Read-only heuristics for the admin shadow audit. These findings never change
 * publication state and never block client_daily delivery. They identify the
 * old self-rated GEO corpus and high-risk copy that should be reviewed before a
 * replacement/migration decision is made.
 */
export function auditPublishedArticleShadow(input: ContentShadowAuditInput): string[] {
  const issues: string[] = [];
  const text = [
    input.title,
    input.description,
    input.content,
    input.site?.name,
    input.site?.url,
    input.site?.industry,
  ]
    .filter(Boolean)
    .join('\n');

  // Historical success-case stories can carry geo_overview as a legacy label;
  // they are user-submitted case content, not factory-generated self-rating.
  const isLegacyFactoryArticle =
    input.category !== 'case-study' && isLegacyGeoTemplate(input.templateType);

  if (isLegacyFactoryArticle) {
    issues.push('legacy_template_requires_replacement');

    if (/GEO\s*分數|AI\s*(?:友善度|能見度)|AI\s*(?:引用|推薦)(?:率|機率)?/i.test(text)) {
      issues.push('legacy_self_rating_language');
    }

    if (!/(?:^|\n)#{1,3}\s*(?:資料來源|來源)|官方網站|https?:\/\//i.test(text)) {
      issues.push('legacy_missing_verifiable_source');
    }
  }

  if (
    /(?:提示詞|prompt|關鍵字佈局|讓\s*AI\s*(?:引用|推薦|收錄)|提高.{0,16}(?:AI\s*)?(?:引用率|推薦機率))/i.test(text)
  ) {
    issues.push('internal_ai_strategy_language');
  }

  const medicalAdjacent =
    /(中醫|診所|醫院|醫師|醫療|整復|整骨|推拿|針灸|復健|物理治療|牙醫|養生|按摩|healthcare|dental|traditional_medicine)/i.test(
      text,
    );
  const unsafeMedicalClaim =
    /(保證治癒|根治|療效|醫療級|促進血液循環|改善(?:健康|身體|症狀|疼痛|病症)|(?:緩解|減輕|消除)疼痛|替代(?:醫師|醫療|治療)|不需(?:看醫生|就醫|醫師))/i.test(
      text,
    );

  if (input.templateType === 'brand_showcase' && medicalAdjacent && unsafeMedicalClaim) {
    issues.push('medical_claim_review_required');
  }

  return [...new Set(issues)];
}
