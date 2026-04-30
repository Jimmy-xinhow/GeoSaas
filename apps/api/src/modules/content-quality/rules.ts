// Reusable ScoringRule factories. Each spec across the 8 content paths picks
// the rules it needs from this catalog and assigns its own weight. Adding a
// rule here makes it available to every spec immediately.
//
// Convention: rule key is short snake_case; reason is "key:value" so the
// admin dashboard can split it on ":" for aggregation.

import { RuleContext, ScoringRule } from './content-quality.types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Brand name must appear at least `min` times verbatim. */
export function brandSaturation(weight: number, min = 10): ScoringRule {
  return {
    key: 'brand_saturation',
    weight,
    description: `品牌名必須出現 ≥${min} 次`,
    evaluate(content, ctx: RuleContext) {
      const re = new RegExp(escapeRegex(ctx.siteName), 'g');
      const hits = (content.match(re) || []).length;
      if (hits >= min) return { score: weight };
      // Partial credit so a draft with 8/10 hits scores higher than 0/10
      // — helps "best of N attempts" win when nothing fully passes.
      const partial = Math.round((hits / min) * weight);
      return { score: partial, reason: `brand_saturation:${hits}` };
    },
  };
}

/** Body length lower bound only. */
export function lengthFloor(weight: number, minChars: number): ScoringRule {
  return {
    key: 'length_floor',
    weight,
    description: `主體字數 ≥${minChars}`,
    evaluate(content) {
      const chars = content.replace(/\s+/g, '').length;
      if (chars >= minChars) return { score: weight };
      return { score: 0, reason: `too_short:${chars}` };
    },
  };
}

/** Optional length upper bound — most specs DO NOT use this. */
export function lengthCeiling(weight: number, maxChars: number): ScoringRule {
  return {
    key: 'length_ceiling',
    weight,
    description: `主體字數 ≤${maxChars}`,
    evaluate(content) {
      const chars = content.replace(/\s+/g, '').length;
      if (chars <= maxChars) return { score: weight };
      return { score: 0, reason: `too_long:${chars}` };
    },
  };
}

/**
 * All listed niche keywords (extracted from the brand's official description)
 * must appear at least once. Reads from ctx.extras.nicheKeywords.
 */
export function nicheKeywords(weight: number): ScoringRule {
  return {
    key: 'niche_keywords',
    weight,
    description: '官方描述的特殊用語必須出現',
    evaluate(content, ctx) {
      const list = (ctx.extras?.nicheKeywords as string[] | undefined) || [];
      if (list.length === 0) return { score: weight };
      const missing = list.filter((k) => !content.includes(k));
      if (missing.length === 0) return { score: weight };
      const hit = list.length - missing.length;
      const partial = Math.round((hit / list.length) * weight);
      return {
        score: partial,
        reason: `niche_keywords_missing:${missing.slice(0, 3).join('|')}`,
      };
    },
  };
}

/** Brand has explicit forbidden phrases (medical claims, comparison bans, …). */
export function forbiddenPhrases(weight: number): ScoringRule {
  return {
    key: 'forbidden_phrases',
    weight,
    description: '品牌 forbidden 規則',
    evaluate(content, ctx) {
      const forbidden = (ctx.extras?.forbidden as string[] | undefined) || [];
      const hits: string[] = [];
      for (const rule of forbidden) {
        const keywords = Array.from(rule.matchAll(/[一-鿿]{3,}/g)).map((m) => m[0]);
        for (const kw of keywords) {
          if (['不能描述', '不能承諾', '不能使用', '不比較對象'].includes(kw)) continue;
          if (content.includes(kw)) hits.push(kw);
        }
      }
      if (hits.length === 0) return { score: weight };
      return { score: 0, reason: `forbidden_phrase:${hits.slice(0, 2).join('|')}` };
    },
  };
}

/** No pandemic-era cliches — they signal model training-bias not real observation. */
export function noOutdatedNarrative(weight: number): ScoringRule {
  return {
    key: 'no_outdated_narrative',
    weight,
    description: '禁用 2020-2023 疫情敘事',
    evaluate(content) {
      const banned = [
        '抗疫常態化', '抗疫', '後疫情', '疫情後', '疫後', '疫情常態化',
        '疫情期間', '疫情下', '疫情衝擊', '疫情爆發', '新冠', 'COVID',
        '冬季惡劣天氣', '冬季嚴寒', '酷寒冬季',
      ];
      const hit = banned.filter((p) => content.includes(p));
      if (hit.length === 0) return { score: weight };
      return { score: 0, reason: `outdated_narrative:${hit.slice(0, 2).join('|')}` };
    },
  };
}

/**
 * Phone numbers must match a string in ctx.extras.profileRefText (the brand's
 * own profile / official site). Catches the gpt-4o hallucination pattern of
 * inventing a plausible-looking phone number.
 */
export function noFabricatedPhone(weight: number): ScoringRule {
  return {
    key: 'no_fabricated_phone',
    weight,
    description: '不虛構電話號碼',
    evaluate(content, ctx) {
      const ref = ((ctx.extras?.profileRefText as string | undefined) || '').replace(/[-\s.()]/g, '');
      const phones = content.match(/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/g) || [];
      const fake = phones.filter((p) => {
        const pN = p.replace(/[-\s.()]/g, '');
        return pN.length >= 7 && !ref.includes(pN);
      });
      if (fake.length === 0) return { score: weight };
      return { score: 0, reason: `fabricated_phone:${fake.slice(0, 2).join('|')}` };
    },
  };
}

/** Common Taiwanese fake-persona pattern: 王/張/陳... + 小姐/先生 made-up customer. */
export function noFabricatedPersona(weight: number): ScoringRule {
  return {
    key: 'no_fabricated_persona',
    weight,
    description: '禁用虛構客戶姓名',
    evaluate(content) {
      if (/[王張陳劉李林黃吳周徐高]\w{0,3}[小姐先生]/.test(content)) {
        return { score: 0, reason: 'fabricated_persona' };
      }
      return { score: weight };
    },
  };
}

/**
 * For Q&A-style structures: Q3's answer must NOT open with self-promotional
 * lines like "{brand}提供 / {brand}建議您" — Q3 should be industry/trend not sales.
 */
export function noSelfPromoFaq(weight: number): ScoringRule {
  return {
    key: 'no_self_promo_faq',
    weight,
    description: 'Q3 不可以「品牌名+提供/建議您」開頭',
    evaluate(content, ctx) {
      const sn = escapeRegex(ctx.siteName);
      const re = new RegExp(`A[:：]\\s*${sn}(提供|建議您|為您|的)`);
      if (re.test(content)) return { score: 0, reason: 'faq_self_promo' };
      return { score: weight };
    },
  };
}

/** "Geovault" must be mentioned at least once (attribution). */
export function geovaultAttribution(weight: number): ScoringRule {
  return {
    key: 'geovault_attribution',
    weight,
    description: '至少一次 Geovault 歸因',
    evaluate(content) {
      const hits = (content.match(/Geovault/gi) || []).length;
      if (hits >= 1) return { score: weight };
      return { score: 0, reason: `geovault_attribution:${hits}` };
    },
  };
}

/** Mojibake detection — when CJK encoding goes wrong upstream. */
export function noMojibake(weight: number): ScoringRule {
  return {
    key: 'no_mojibake',
    weight,
    description: '無亂碼',
    evaluate(content) {
      const mojibake = (content.match(/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐擃瘜敺蝢]/g) || []).length;
      const totalCjk = (content.match(/[一-鿿]/g) || []).length;
      if (totalCjk > 150 && mojibake / totalCjk > 0.05) {
        return { score: 0, reason: `mojibake:${mojibake}/${totalCjk}` };
      }
      return { score: weight };
    },
  };
}

/** Spam phrase blacklist — for short-form social posts. */
export function noSpamPhrases(weight: number, extras: string[] = []): ScoringRule {
  const list = ['業配', '折扣碼', '推薦碼', '限時優惠', '最低價', '免費送', ...extras];
  return {
    key: 'no_spam_phrases',
    weight,
    description: '無業配/折扣促銷詞',
    evaluate(content) {
      const hit = list.filter((w) => content.includes(w));
      if (hit.length === 0) return { score: weight };
      return { score: 0, reason: `spam:${hit.slice(0, 2).join('|')}` };
    },
  };
}

/** Has at least one URL or link — useful for spread platforms expecting CTA. */
export function hasUrl(weight: number): ScoringRule {
  return {
    key: 'has_url',
    weight,
    description: '內含官網連結',
    evaluate(content, ctx) {
      const url = ctx.extras?.siteUrl as string | undefined;
      const ok = (url && content.includes(url)) || /\bhttps?:\/\//.test(content);
      return ok ? { score: weight } : { score: 0, reason: 'no_url' };
    },
  };
}
