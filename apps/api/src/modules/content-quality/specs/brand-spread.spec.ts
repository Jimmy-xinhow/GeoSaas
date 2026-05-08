// brand_spread ContentSpec — short-form multi-platform copy (Medium /
// vocus / LinkedIn / FB / Google Business / PTT). Migrated from
// BrandSpreadService.scoreContent + the 2-attempt loop.
//
// Each platform gets its own spec via createBrandSpreadSpec(platform).
// They share the rule set; only length window + brand-saturation min
// differ. Threshold: 80/100. Rule weights sum to 100.
//
// Output is JSON ({title, content, hashtags}); spec.parseContent extracts
// the body text and stashes hashtags into ctx.extras so the hashHashtags
// rule can score them without re-parsing.

import { ContentSpec, ScoringRule, RuleContext } from '../content-quality.types';
import {
  brandSaturation,
  firstHandDataAnchors,
  forbiddenPhrases,
  hasHashtags,
  hasSpecificFacts,
  hasUrl,
  lengthInRange,
  naturalTone,
  noCTABoilerplate,
  noFirstPersonPromo,
  noHyperbole,
  noOutdatedNarrative,
  noSpamPhrases,
  paragraphStructure,
} from '../rules';

export interface BrandSpreadPlatform {
  key: string;
  name: string;
  lengthGuide: string;     // "800-1200 字"
  prompt: string;          // platform-specific writing instructions
}

export interface BrandSpreadData {
  systemPrompt: string;    // big system prompt with industry guideline
  userPrompt: string;      // platform + brand context block
}

// v4 weighting — adds first-hand data + specific-facts + outdated-narrative
// guards to defend against Google's "scaled content abuse" classifier. The
// big change is firstHandDataAnchors at weight 15: forces the model to cite
// real SiteQa fragments / scan score / profile services rather than generic
// industry copy. Existing v3 advertorial detectors stay but with reduced
// weight — they were over-protective for social posts that legitimately
// need light conversational tone.
function ruleSet(
  minBrandHits: number,
  minLen: number,
  maxLen: number,
  minAnchors: number,
): ScoringRule[] {
  return [
    brandSaturation(10, minBrandHits),    // ↓ 12 → 10
    lengthInRange(10, minLen, maxLen),    // ↓ 12 → 10
    hasUrl(6),                            // ↓ 8 → 6
    forbiddenPhrases(8),                  // ↓ 10 → 8
    noSpamPhrases(10),                    // ↓ 15 → 10
    naturalTone(7),                       // ↓ 10 → 7
    hasHashtags(2, 3),
    paragraphStructure(4, 3),             // ↓ 6 → 4
    noHyperbole(8),                       // ↓ 10 → 8
    noFirstPersonPromo(6),                // ↓ 8 → 6
    noCTABoilerplate(5),                  // ↓ 7 → 5
    // v4 E-E-A-T / anti-template detectors ↓
    firstHandDataAnchors(15, minAnchors), // 強制引用品牌實際資料(SiteQa/profile/scan)
    hasSpecificFacts(6, 2),               // 至少 2 個具體事實(年資/價格/時長等)
    noOutdatedNarrative(3),               // 禁用「疫情後」等過時敘事
  ];
  // Sum: 10+10+6+8+10+7+2+4+8+6+5+15+6+3 = 100
}

function buildPatch(args: {
  data: BrandSpreadData;
  previousContent: string;
  failedRules: string[];
}): string {
  return `${args.data.systemPrompt}

${args.data.userPrompt}

【上一版草稿(JSON)】
${args.previousContent}

【上一版檢測出的問題】
${args.failedRules.map((r) => `- ${r}`).join('\n')}

請修正上述問題並直接輸出新版 JSON({title, content, hashtags})。
- brand_saturation 不足 → 在現有段落補入品牌名,不要新增段落
- length_in_range / length_off → 調整字數至範圍內
- no_url → 加入官網連結(自然融入,不要「點擊這裡」)
- forbidden_phrase / no_spam_phrases → 刪除違規詞改寫
- excessive_exclaim → 減少驚嘆號
- hashtags / paragraphs → 補齊 hashtags(≥3) 或重組段落(≥3)
- first_hand_data → 引用「品牌資料」段落中提供的實際 SiteQa 答案、服務項目、地點或 GEO 分數,不要使用泛用行業敘述
- specific_facts → 補入具體事實(年資/服務項數/分鐘/地址),不要寫「優質的服務」這種空話
- outdated_narrative → 移除「疫情後/抗疫」等過時用語,改用當下情境
- hyperbole / first_person_promo / cta_boilerplate → 改寫為第三人稱、客觀陳述,不要「最佳/我們/立即預約」`;
}

/**
 * Default config — covers all 6 PLATFORMS in BrandSpreadService.
 * brandSaturation min stays 3 for short posts (LinkedIn/FB/PTT) and bumps
 * to 5 for the long-form ones (Medium/vocus/Google Business). minAnchors
 * (first-hand data anchor count) follows the same long/short split: short
 * posts get 2 anchors so they remain readable, long-form gets 3.
 */
const platformConfig: Record<
  string,
  { minBrand: number; minLen: number; maxLen: number; minAnchors: number }
> = {
  medium:           { minBrand: 5, minLen: 800,  maxLen: 1200, minAnchors: 3 },
  vocus:            { minBrand: 5, minLen: 600,  maxLen: 900,  minAnchors: 3 },
  linkedin:         { minBrand: 3, minLen: 200,  maxLen: 400,  minAnchors: 2 },
  facebook:         { minBrand: 3, minLen: 150,  maxLen: 300,  minAnchors: 2 },
  google_business:  { minBrand: 5, minLen: 150,  maxLen: 750,  minAnchors: 3 },
  ptt:              { minBrand: 3, minLen: 300,  maxLen: 600,  minAnchors: 2 },
};

export function createBrandSpreadSpec(
  platformKey: string,
): ContentSpec<BrandSpreadData> {
  const cfg =
    platformConfig[platformKey] ??
    { minBrand: 3, minLen: 200, maxLen: 800, minAnchors: 2 };
  return {
    templateType: `brand_spread/${platformKey}`,
    promptVersion: 'v4',
    fullModel: 'gpt-4o',
    fullMaxTokens: 2500,
    fullResponseFormat: 'json_object',
    buildFullPrompt: ({ data }) => `${data.systemPrompt}\n\n${data.userPrompt}`,
    parseContent: (raw: string, ctx: RuleContext) => {
      // Extract content + hashtags + title from JSON; rules score plain
      // content text. Caller passes a shared extras object and reads the
      // parsed fields back out after the runner finishes.
      try {
        const parsed = JSON.parse(raw);
        if (ctx.extras) {
          ctx.extras.hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
          if (typeof parsed.title === 'string') ctx.extras.title = parsed.title;
        }
        return typeof parsed.content === 'string' ? parsed.content : raw;
      } catch {
        return raw;
      }
    },
    rules: ruleSet(cfg.minBrand, cfg.minLen, cfg.maxLen, cfg.minAnchors),
    passThreshold: 80,
    maxFullRetries: 1,
    maxPatchRetries: 1,    // short content patches faster
    patchMaxTokens: 2500,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
