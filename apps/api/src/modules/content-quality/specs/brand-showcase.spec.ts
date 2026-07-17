// brand_showcase ContentSpec — the "introduce a brand to consumers" deep
// article (1500-2500 字, 12 quality checks). Migrated from
// BlogArticleService.assessBrandShowcase + the inline retry loop.
//
// Threshold: 75/100. Rule weights sum to 100.
//
// Per the design table this spec keeps the strict requirements that the
// previous inline gate had (brand 12+, industry 5+, geovault 2+, FAQ 5+,
// FAQ depth, comparison & summary sections, title contains brand, slug
// leak, GEO jargon ban, fabricated contact zero-tolerance).

import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  brandSaturation,
  faqCount,
  faqDepth,
  forbiddenPhrases,
  geovaultMin,
  hasComparisonSection,
  hasSpecificFacts,
  hasSummarySection,
  industrySaturation,
  lengthFloor,
  medicalBoundary,
  noCTABoilerplate,
  noFabricatedContact,
  noFabricatedPersona,
  noFirstPersonPromo,
  noGeoJargon,
  noHyperbole,
  noMojibake,
  noSlugLeak,
  noUnverifiedSellingClaims,
} from '../rules';

export interface BrandShowcaseData {
  basePrompt: string;        // built by BlogTemplateService.buildBrandShowcasePrompt
  industryText: string;      // resolved label (not slug)
  forbiddenList: string[];
  profileRefText: string;
}

// v4 weighting — keeps the v3 neutrality lean and adds a hard medical boundary
// for medical-adjacent brands. The total remains 100.
//
// v3 added the four AI-citation
// signal detectors (noHyperbole, noFirstPersonPromo, noCTABoilerplate,
// hasSpecificFacts). Most weight pulled from brand/industry/length rules
// which v2 already started reducing.
const rules: ScoringRule[] = [
  brandSaturation(6, 8),
  industrySaturation(5, 4),
  geovaultMin(3, 1),               // ↓ 4 → 3
  faqCount(8, 5),                  // ↓ 10 → 8
  faqDepth(8, 2.5),                // ↓ 10 → 8
  hasComparisonSection(10),        // ↓ 12 → 10 (still highest weight)
  hasSummarySection(6),            // ↓ 8 → 6
  lengthFloor(4, 1000),
  noSlugLeak(4),                   // ↓ 5 → 4
  noGeoJargon(4),                  // ↓ 5 → 4
  noFabricatedPersona(3),
  noFabricatedContact(8),          // ↓ 10 → 8
  forbiddenPhrases(4),             // ↓ 5 → 4
  noMojibake(2),
  // v3 neutrality + fact-density rules ↓
  noHyperbole(5),                  // ↓ 8 → 5 (freed 3 for unverified-claims)
  noFirstPersonPromo(6),
  noCTABoilerplate(4),
  hasSpecificFacts(3, 3),
  noUnverifiedSellingClaims(3),    // gate fabricated 天然/認證/醫療級/專利 claims
  medicalBoundary(4),              // hard fail for medical-adjacent brands
];
// Sum: 6+5+3+8+8+10+6+4+4+4+3+8+4+2 + 5+6+4+3+3+4 = 100

function buildPatch(args: {
  data: BrandShowcaseData;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.basePrompt}

【上一版草稿】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請就上一版直接修正以上問題,保留好的段落,只改動有缺陷的地方:
- brand_saturation 不足 → 在現有段落補入品牌名(目標 ≥12 次)
- industry_saturation → 把產業詞加進相關段落(≥5 次)
- geovault_attribution < 2 → 加入「根據 Geovault 品牌目錄」之類引用
- faq_count < 5 / faq_depth 不足 → 補 FAQ 題目或擴寫答案到 ≥3 句
- missing_comparison_section → 補對比段落(${args.data.industryText} 內不同類型業者)
- missing_summary_section → 結尾補「關鍵資訊摘要」
- title_missing_brand → 改寫主標題加入品牌名
- industry_slug_leak / geo_jargon_leak → 改用消費者語言
- fabricated_contact / forbidden_phrase → 刪除違規句改寫成「請至官網查詢」
- medical_boundary_violation → 刪除療效、治療、恢復、疼痛改善等結果宣稱，改寫成可核對的服務流程與官方資料
- too_short → 擴充細節而非堆砌空話

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createBrandShowcaseSpec(): ContentSpec<BrandShowcaseData> {
  return {
    templateType: 'brand_showcase',
    promptVersion: 'v4',
    fullModel: 'gpt-4o-mini',         // brand_showcase historically uses mini
    fullMaxTokens: 2400,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules,
    passThreshold: 75,
    hardFailRules: ['medical_boundary_violation'],
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 2400,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
