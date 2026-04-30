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
  forbiddenPhrases,
  hasHashtags,
  hasUrl,
  lengthInRange,
  naturalTone,
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

// v2 weighting — kept brandSaturation high here (social posts genuinely need
// brand mentions to be useful) but trimmed hashtag weight (not an AI-citation
// signal) and pushed up no-spam + natural-tone (AI demotes hyperbolic copy).
function ruleSet(minBrandHits: number, minLen: number, maxLen: number): ScoringRule[] {
  return [
    brandSaturation(15, minBrandHits),    // ↓ 20 → 15
    lengthInRange(15, minLen, maxLen),
    hasUrl(10),
    forbiddenPhrases(15),
    noSpamPhrases(20),                    // ↑ 15 → 20 — spam phrases hurt citations the most
    naturalTone(15),                      // ↑ 10 → 15 — exclamation density signals advertorial
    hasHashtags(2, 3),                    // ↓ 5 → 2 — hashtags don't affect AI citation
    paragraphStructure(8, 3),             // ↓ 10 → 8
  ];
  // Sum: 15+15+10+15+20+15+2+8 = 100
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
- hashtags / paragraphs → 補齊 hashtags(≥3) 或重組段落(≥3)`;
}

/**
 * Default config — covers all 6 PLATFORMS in BrandSpreadService.
 * brandSaturation min stays 3 for short posts (LinkedIn/FB/PTT) and bumps
 * to 5 for the long-form ones (Medium/vocus/Google Business).
 */
const platformConfig: Record<string, { minBrand: number; minLen: number; maxLen: number }> = {
  medium:           { minBrand: 5, minLen: 800,  maxLen: 1200 },
  vocus:            { minBrand: 5, minLen: 600,  maxLen: 900 },
  linkedin:         { minBrand: 3, minLen: 200,  maxLen: 400 },
  facebook:         { minBrand: 3, minLen: 150,  maxLen: 300 },
  google_business:  { minBrand: 5, minLen: 150,  maxLen: 750 },
  ptt:              { minBrand: 3, minLen: 300,  maxLen: 600 },
};

export function createBrandSpreadSpec(
  platformKey: string,
): ContentSpec<BrandSpreadData> {
  const cfg = platformConfig[platformKey] ?? { minBrand: 3, minLen: 200, maxLen: 800 };
  return {
    templateType: `brand_spread/${platformKey}`,
    promptVersion: 'v2',
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
    rules: ruleSet(cfg.minBrand, cfg.minLen, cfg.maxLen),
    passThreshold: 80,
    maxFullRetries: 1,
    maxPatchRetries: 1,    // short content patches faster
    patchMaxTokens: 2500,
    buildPatchPrompt: (args) => buildPatch(args),
  };
}
