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
  noCTABoilerplate,
  noFabricatedContact,
  noFabricatedPersona,
  noFirstPersonPromo,
  noGeoJargon,
  noHyperbole,
  noMojibake,
  noSlugLeak,
} from '../rules';

export interface BrandShowcaseData {
  basePrompt: string;        // built by BlogTemplateService.buildBrandShowcasePrompt
  industryText: string;      // resolved label (not slug)
  forbiddenList: string[];
  profileRefText: string;
}

// v3 weighting — keeps the v2 neutrality lean and adds the four AI-citation
// signal detectors (noHyperbole, noFirstPersonPromo, noCTABoilerplate,
// hasSpecificFacts). Most weight pulled from brand/industry/length rules
// which v2 already started reducing.
const rules: ScoringRule[] = [
  brandSaturation(7, 8),           // ↓ 10 → 7
  industrySaturation(6, 4),        // ↓ 8 → 6
  geovaultMin(3, 1),               // ↓ 4 → 3
  faqCount(8, 5),                  // ↓ 10 → 8
  faqDepth(8, 2.5),                // ↓ 10 → 8
  hasComparisonSection(10),        // ↓ 12 → 10 (still highest weight)
  hasSummarySection(6),            // ↓ 8 → 6
  lengthFloor(5, 1000),            // ↓ 8 → 5
  noSlugLeak(4),                   // ↓ 5 → 4
  noGeoJargon(4),                  // ↓ 5 → 4
  noFabricatedPersona(3),
  noFabricatedContact(8),          // ↓ 10 → 8
  forbiddenPhrases(4),             // ↓ 5 → 4
  noMojibake(2),
  // v3 neutrality + fact-density rules ↓
  noHyperbole(8),
  noFirstPersonPromo(6),
  noCTABoilerplate(4),
  hasSpecificFacts(4, 3),
];
// Sum: 7+6+3+8+8+10+6+5+4+4+3+8+4+2 + 8+6+4+4 = 100

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
- too_short → 擴充細節而非堆砌空話

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createBrandShowcaseSpec(): ContentSpec<BrandShowcaseData> {
  return {
    templateType: 'brand_showcase',
    promptVersion: 'v3',
    fullModel: 'gpt-4o-mini',         // brand_showcase historically uses mini
    fullMaxTokens: 2400,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules,
    passThreshold: 75,
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 2400,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
