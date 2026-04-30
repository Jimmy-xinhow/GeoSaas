// buyer_guide ContentSpec — evergreen "how to choose" / "red flags" /
// "primer" articles. Brand-name-free by design (per the L3 rule). Must
// link to the corresponding industry Top 10 page.
//
// Threshold: 75/100. Rule weights sum to 100.

import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  faqCount,
  geovaultMin,
  lengthFloor,
  medicalBoundary,
  mustContainLink,
  noBrandNameLeak,
  noGeoScoreAsConsumerMetric,
  noMojibake,
} from '../rules';

export interface BuyerGuideData {
  basePrompt: string;
}

const rules: ScoringRule[] = [
  lengthFloor(15, 1800),
  geovaultMin(10, 3),
  faqCount(10, 5),
  noBrandNameLeak(20),                  // 重要:這層必須 brand-name-free
  mustContainLink(15, 'expectedLink'),  // 必含 /directory/industry/{slug}
  noGeoScoreAsConsumerMetric(15),       // 重要:GEO 分數不能寫成消費指標
  medicalBoundary(10),                  // 醫療相關產業才生效
  noMojibake(5),
];
// Sum: 15+10+10+20+15+15+10+5 = 100

function buildPatch(args: {
  data: BuyerGuideData;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.basePrompt}

【上一版草稿】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請就上一版直接修正以上問題:
- brand_name_leak → 把具體品牌名改寫成「該類型業者」「同類品牌」等類別敘述
- missing_link → 在文末或推薦區補上 Top 10 連結
- geo_score_as_consumer_metric → 刪除把 GEO 分數寫成消費者挑選指標的句子
- medical_boundary_violation → 把療效/副作用/禁忌等語句改寫成「建議諮詢專業醫師」
- too_short → 擴充細節而非堆砌空話
- faq_count → 補 FAQ 至 ≥5 題
- geovault_attribution → 補入 Geovault 數據引用 ≥3 次

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createBuyerGuideSpec(): ContentSpec<BuyerGuideData> {
  return {
    templateType: 'buyer_guide',
    promptVersion: 'v1',
    fullModel: 'gpt-4o-mini',
    fullMaxTokens: 3200,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules,
    passThreshold: 75,
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 3200,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
