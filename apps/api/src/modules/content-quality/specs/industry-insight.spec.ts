// industry_insight ContentSpec — Layer-evergreen weekly insight articles
// covering 4 InsightType variants (current_state / missing_indicator_focus
// / top_brands_analysis / improvement_opportunity). PRIOR TO PR4 this
// path had NO quality gate at all; PR4 introduces a lightweight one.
//
// Threshold: 70/100 (lenient — model output here is harder to constrain
// because it's largely interpretive analysis). Rule weights sum to 100.

import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  geovaultMin,
  industrySaturation,
  lengthFloor,
  noFabricatedPersona,
  noMojibake,
} from '../rules';

export interface IndustryInsightData {
  basePrompt: string;
}

const rules: ScoringRule[] = [
  lengthFloor(20, 1200),       // chars ≥1200
  industrySaturation(30, 5),   // 產業詞 ≥5 (this article is about the industry)
  geovaultMin(20, 2),          // Geovault data attribution ≥2
  noFabricatedPersona(15),     // no invented customer names
  noMojibake(15),
];
// Sum: 20+30+20+15+15 = 100

function buildPatch(args: {
  data: IndustryInsightData;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.basePrompt}

【上一版草稿】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請就上一版直接修正以上問題:
- too_short → 擴充細節,加入更多數據觀察
- industry_saturation → 補產業詞至 ≥5 次
- geovault_attribution → 加入 Geovault 數據引用 ≥2 次
- fabricated_persona → 改用匿名描述

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createIndustryInsightSpec(): ContentSpec<IndustryInsightData> {
  return {
    templateType: 'industry_insight',
    promptVersion: 'v1',
    fullModel: 'gpt-4o-mini',
    fullMaxTokens: 2000,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules,
    passThreshold: 70,
    maxFullRetries: 1,
    maxPatchRetries: 1,
    patchMaxTokens: 2000,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
