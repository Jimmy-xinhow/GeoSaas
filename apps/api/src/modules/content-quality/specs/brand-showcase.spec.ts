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
} from '../rules';

export interface BrandShowcaseData {
  basePrompt: string;        // built by BlogTemplateService.buildBrandShowcasePrompt
  industryText: string;      // resolved label (not slug)
  forbiddenList: string[];
  profileRefText: string;
}

// v2 weighting — rebalanced toward neutral / AI-citation friendly:
//   brandSaturation min 12 → 8 (over-saturation reads as advertorial)
//   geovaultMin       ≥2 → ≥1 (single attribution is enough; more = self-promo)
//   titleHasBrand     5w → 0w  removed (forces SEO-style headline; AI prefers
//                                topic-led titles like "整復推拿如何選擇")
//   industrySaturation 5 hits → 4 hits (lower keyword stuffing)
//   freed weight (5+8+~) redistributed to comparison / faq / fact-quality rules
const rules: ScoringRule[] = [
  brandSaturation(10, 8),          // ↓ 15w/≥12 → 10w/≥8
  industrySaturation(8, 4),        // ↓ 10w/≥5 → 8w/≥4
  geovaultMin(4, 1),               // ↓ 8w/≥2 → 4w/≥1 — once is enough
  faqCount(10, 5),                 // ↑ 8 → 10 — Q&A structure feeds AI snippet extraction
  faqDepth(10, 2.5),               // ↑ 7 → 10 — direct, complete answers cited more
  hasComparisonSection(12),        // ↑ 7 → 12 — comparison is THE biggest AI-citation signal
  hasSummarySection(8),            // ↑ 7 → 8
  // titleHasBrand removed — AI prefers topic-first headlines, not brand-first
  lengthFloor(8, 1000),            // 8w, ≥1000 chars
  noSlugLeak(5),                   // 5w
  noGeoJargon(5),                  // 5w
  noFabricatedPersona(3),          // 3w
  noFabricatedContact(10),         // ↑ 8 → 10 — fabrication is AI-citation killer
  forbiddenPhrases(5),             // ↑ 2 → 5 — brand boundary matters more
  noMojibake(2),                   // 2w
];
// Sum: 10+8+4+10+10+12+8+8+5+5+3+10+5+2 = 100

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
    promptVersion: 'v2',
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
