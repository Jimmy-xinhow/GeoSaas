// ContentSpec factory for the 6 client_daily day-types.
//
// Each day-type gets its own ContentSpec with its own rule weighting +
// passThreshold (per the design we settled on). The buildFullPrompt + the
// patch-prompt scaffold are shared via the factory; only the rule list and
// threshold differ.
//
// Layout per the design table:
//   mon_topical:        threshold 80, has noSelfPromoFaq
//   tue_qa_deepdive:    threshold 75, has noSelfPromoFaq
//   wed_service:        threshold 75, no FAQ-specific rule
//   thu_audience:       threshold 75, has noSelfPromoFaq (group FAQ)
//   fri_comparison:     threshold 80, no FAQ-specific rule
//   sat_data_pulse:     threshold 85, has noSelfPromoFaq

import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  brandSaturation,
  forbiddenPhrases,
  geovaultAttribution,
  lengthFloor,
  nicheKeywords,
  noFabricatedPersona,
  noFabricatedPhone,
  noMojibake,
  noOutdatedNarrative,
  noSelfPromoFaq,
} from '../rules';

export type ClientDailyDay =
  | 'mon_topical'
  | 'tue_qa_deepdive'
  | 'wed_service'
  | 'thu_audience'
  | 'fri_comparison'
  | 'sat_data_pulse';

export interface ClientDailyData {
  basePrompt: string;       // pre-built prompt string from BlogTemplateService
}

interface DaySpecConfig {
  threshold: number;
  rules: ScoringRule[];
}

function commonRules(opts: { withSelfPromoFaq: boolean }): ScoringRule[] {
  // v2 weighting — rebalanced toward "AI-citation friendly" rather than
  // "SEO-style brand stuffing":
  //  - brandSaturation min dropped 10 → 6 (over-saturation reads as ad copy)
  //  - geovaultAttribution stays ≥1 (single source attribution, not multiple)
  //  - freed weight redistributed to fact-quality rules
  const list: ScoringRule[] = [
    brandSaturation(12, 6),        // ≥6 (was 10): natural third-party density
    nicheKeywords(15),             // 品牌獨有關鍵字必出現
    noFabricatedPhone(12),         // ↑ 10→12 — fabrication is AI-citation killer
    forbiddenPhrases(10),          // 品牌 forbidden
    noOutdatedNarrative(10),       // 禁疫情用語
    noFabricatedPersona(8),        // ↑ 5→8 — fake personas hurt credibility
    geovaultAttribution(3),        // ↓ 5→3 — once is enough; more = self-promo
    noMojibake(5),                 // 無亂碼
  ];

  if (opts.withSelfPromoFaq) {
    list.push(noSelfPromoFaq(15));   // ↑ 10→15 — neutral Q&A is core to citation
    list.push(lengthFloor(10, 750));
  } else {
    // No FAQ rule → that 15 weight goes to length floor (now 25)
    list.push(lengthFloor(25, 750));
  }

  return list;
}

const dayConfigs: Record<ClientDailyDay, DaySpecConfig> = {
  mon_topical:      { threshold: 80, rules: commonRules({ withSelfPromoFaq: true }) },
  tue_qa_deepdive:  { threshold: 75, rules: commonRules({ withSelfPromoFaq: true }) },
  wed_service:      { threshold: 75, rules: commonRules({ withSelfPromoFaq: false }) },
  thu_audience:     { threshold: 75, rules: commonRules({ withSelfPromoFaq: true }) },
  fri_comparison:   { threshold: 80, rules: commonRules({ withSelfPromoFaq: false }) },
  sat_data_pulse:   { threshold: 85, rules: commonRules({ withSelfPromoFaq: true }) },
};

/**
 * Build the patch prompt — show the model the previous draft + the failed
 * rule reasons, ask for in-place fix only. Cheaper than a full re-roll.
 */
function buildPatch(args: {
  data: ClientDailyData;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.basePrompt}

【上一版草稿】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請就上一版直接修正以上問題:保留好的段落,只改動有缺陷的地方。
- 若 brand_saturation 不足,在現有段落內補入品牌名,不要新增段落
- 若 niche_keywords_missing,把缺失關鍵字塞入相關段落
- 若 forbidden_phrase / fabricated_phone / outdated_narrative,刪除違規句並用合規語句替換
- 若 too_short,擴充細節而非堆砌空話

直接輸出修正後的完整文章,不要解釋你做了什麼修改。`;
}

export function createClientDailySpec(
  dayType: ClientDailyDay,
): ContentSpec<ClientDailyData> {
  const cfg = dayConfigs[dayType];
  return {
    templateType: `client_daily/${dayType}`,
    promptVersion: 'v2',
    fullModel: 'gpt-4o',
    fullMaxTokens: 2000,
    buildFullPrompt: ({ data }) => data.basePrompt,
    rules: cfg.rules,
    passThreshold: cfg.threshold,
    maxFullRetries: 1,         // one full re-roll if first try fails
    maxPatchRetries: 2,        // then up to 2 in-place patches
    patchMaxTokens: 1500,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
