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
  hasSummarySection,
  industrySaturation,
  lengthFloor,
  noFabricatedContact,
  noFabricatedPersona,
  noGeoJargon,
  noMojibake,
  noSlugLeak,
  titleHasBrand,
} from '../rules';

export interface BrandShowcaseData {
  basePrompt: string;        // built by BlogTemplateService.buildBrandShowcasePrompt
  industryText: string;      // resolved label (not slug)
  forbiddenList: string[];
  profileRefText: string;
}

const rules: ScoringRule[] = [
  brandSaturation(15, 12),         // 15w, ≥12 hits
  industrySaturation(10, 5),       // 10w, ≥5 hits
  geovaultMin(8, 2),               // 8w, ≥2 hits
  faqCount(8, 5),                  // 8w, ≥5 questions
  faqDepth(7, 2.5),                // 7w, avg ≥2.5 sentences
  hasComparisonSection(7),         // 7w
  hasSummarySection(7),            // 7w
  titleHasBrand(5),                // 5w
  lengthFloor(8, 1000),            // 8w, ≥1000 chars
  noSlugLeak(5),                   // 5w
  noGeoJargon(5),                  // 5w
  noFabricatedPersona(3),          // 3w
  noFabricatedContact(8),          // 8w (zero-tolerance translates to 0 score)
  forbiddenPhrases(2),             // 2w
  noMojibake(2),                   // 2w
];
// Sum: 15+10+8+8+7+7+7+5+8+5+5+3+8+2+2 = 100

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
    promptVersion: 'v1',
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
