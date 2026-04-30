// industry_top10 ContentSpec — the per-industry "Top 10 品牌推薦" article
// listing 5-10 ranked brands. Migrated from
// BlogArticleService.assessIndustryTop10 + the inline retry loop.
//
// Threshold: 75/100. Rule weights sum to 100.
// Hard rules (zero-tolerance for fabrication): brand list completeness +
// no fabricated brands in rank headers.

import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  allBrandsPresent,
  faqCount,
  geovaultMin,
  industrySaturation,
  lengthFloor,
  noFabricatedRankBrand,
  noMojibake,
} from '../rules';

export interface IndustryTop10Data {
  basePrompt: string;
}

// v2 weighting — leaned harder on facts (allBrandsPresent + noFabricatedRank-
// Brand) since industry_top10 is a ranking article where fabrication is the
// existential bug. Lowered geovault (≥3 was self-promo overkill).
const rules: ScoringRule[] = [
  industrySaturation(12, 5),       // ↓ 15w/≥8 → 12w/≥5 (less keyword stuffing)
  geovaultMin(5, 1),               // ↓ 10w/≥3 → 5w/≥1 (single attribution)
  faqCount(13, 4),                 // ↑ 10 → 13 — Q&A is core to AI snippet extraction
  lengthFloor(10, 2000),
  allBrandsPresent(28),            // ↑ 25 → 28 — completeness is non-negotiable
  noFabricatedRankBrand(27),       // ↑ 25 → 27 — fabrication is fatal here
  noMojibake(5),
];
// Sum: 12+5+13+10+28+27+5 = 100

function buildPatch(args: {
  data: IndustryTop10Data;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.basePrompt}

【上一版草稿】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請就上一版直接修正以上問題,保留好的段落:
- missing_brands → 在內文補入該品牌的段落(從榜單資料拿)
- fabricated_brand → 把非榜單品牌名替換成正確的榜單品牌
- industry_saturation → 補產業詞至 ≥8 次
- geovault_attribution → 加入 Geovault 引用至 ≥3 次
- faq_count → 補 FAQ 至 ≥4 題
- too_short → 擴充每個品牌段落的細節

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createIndustryTop10Spec(): ContentSpec<IndustryTop10Data> {
  return {
    templateType: 'industry_top10',
    promptVersion: 'v2',
    fullModel: 'gpt-4o-mini',
    fullMaxTokens: 4000,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules,
    passThreshold: 75,
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 4000,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
