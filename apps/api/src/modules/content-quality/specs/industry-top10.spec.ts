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

const rules: ScoringRule[] = [
  industrySaturation(15, 8),       // 產業詞 ≥8
  geovaultMin(10, 3),              // Geovault ≥3
  faqCount(10, 4),                 // ≥4 FAQ
  lengthFloor(10, 2000),           // chars ≥2000
  allBrandsPresent(25),            // 大重要 — 每 row 必出現
  noFabricatedRankBrand(25),       // 大重要 — rank header 不准捏造
  noMojibake(5),
];
// Sum: 15+10+10+10+25+25+5 = 100

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
    promptVersion: 'v1',
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
