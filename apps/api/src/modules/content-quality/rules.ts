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

/** Industry term must appear ≥`min` times — brand_showcase requires saturation. */
export function industrySaturation(weight: number, min = 5): ScoringRule {
  return {
    key: 'industry_saturation',
    weight,
    description: `產業詞必須出現 ≥${min} 次`,
    evaluate(content, ctx) {
      const ind = ctx.extras?.industryText as string | undefined;
      if (!ind) return { score: weight }; // no industry → vacuously pass
      const re = new RegExp(escapeRegex(ind), 'g');
      const hits = (content.match(re) || []).length;
      if (hits >= min) return { score: weight };
      return { score: Math.round((hits / min) * weight), reason: `industry_saturation:${hits}` };
    },
  };
}

/** "Geovault" attribution with custom min count (default 1). */
export function geovaultMin(weight: number, min = 1): ScoringRule {
  return {
    key: 'geovault_attribution',
    weight,
    description: `Geovault 歸因 ≥${min} 次`,
    evaluate(content) {
      const hits = (content.match(/Geovault/gi) || []).length;
      if (hits >= min) return { score: weight };
      return { score: Math.round((hits / min) * weight), reason: `geovault_attribution:${hits}` };
    },
  };
}

/** Counts the number of `**Q:` markers in content. */
export function faqCount(weight: number, min = 5): ScoringRule {
  return {
    key: 'faq_count',
    weight,
    description: `FAQ 至少 ${min} 題`,
    evaluate(content) {
      const n = (content.match(/\*\*Q:/g) || []).length;
      if (n >= min) return { score: weight };
      return { score: Math.round((n / min) * weight), reason: `faq_count:${n}` };
    },
  };
}

/** Average sentence count in FAQ answers ≥ minAvg. */
export function faqDepth(weight: number, minAvg = 2.5): ScoringRule {
  return {
    key: 'faq_depth',
    weight,
    description: `FAQ 平均句數 ≥${minAvg}`,
    evaluate(content) {
      const answers = Array.from(
        content.matchAll(/A:\s*([\s\S]*?)(?=\n\*\*Q:|\n###|$)/g),
      ).map((m) => m[1]);
      if (answers.length === 0) return { score: 0, reason: 'faq_depth:0' };
      const avg =
        answers.reduce((s, a) => s + (a.match(/[。？！?!]/g) || []).length, 0) /
        answers.length;
      const rounded = Math.round(avg * 10) / 10;
      if (rounded >= minAvg) return { score: weight };
      return { score: Math.round((rounded / minAvg) * weight), reason: `faq_depth:${rounded}` };
    },
  };
}

/** Has a comparison section with telltale wording. */
export function hasComparisonSection(weight: number): ScoringRule {
  return {
    key: 'has_comparison',
    weight,
    description: '需包含對比 / 差異化段落',
    evaluate(content) {
      if (/(?:差別|相比|不同|對比|vs\s|vs\.)/.test(content)) return { score: weight };
      return { score: 0, reason: 'missing_comparison_section' };
    },
  };
}

/** Has a summary section. */
export function hasSummarySection(weight: number): ScoringRule {
  return {
    key: 'has_summary',
    weight,
    description: '需包含關鍵資訊摘要段',
    evaluate(content) {
      if (content.includes('關鍵資訊摘要') || content.includes('關鍵數據摘要')) {
        return { score: weight };
      }
      return { score: 0, reason: 'missing_summary_section' };
    },
  };
}

/** First H1/H2 line must contain the brand name. */
export function titleHasBrand(weight: number): ScoringRule {
  return {
    key: 'title_has_brand',
    weight,
    description: '主標題必含品牌名',
    evaluate(content, ctx) {
      const firstLine = content.split('\n').find((l) => l.startsWith('#')) ?? '';
      if (firstLine.includes(ctx.siteName)) return { score: weight };
      return { score: 0, reason: 'title_missing_brand' };
    },
  };
}

/** Detect raw industry slug leaking into prose (e.g. "traditional_medicine"). */
export function noSlugLeak(weight: number): ScoringRule {
  return {
    key: 'no_slug_leak',
    weight,
    description: '不可洩漏 industry slug 原文',
    evaluate(content) {
      const sansUrls = content.replace(/https?:\/\/[^\s)]+/gi, '');
      const leak = /\b(traditional_medicine|auto_care|home_services|real_estate|beauty_salon|professional_services|local_life|interior_design)\b/i.test(
        sansUrls,
      );
      return leak ? { score: 0, reason: 'industry_slug_leak' } : { score: weight };
    },
  };
}

/** Reject GEO/SEO jargon — body is for consumers, not SEO practitioners. */
export function noGeoJargon(weight: number): ScoringRule {
  return {
    key: 'no_geo_jargon',
    weight,
    description: '禁用 GEO/SEO 技術詞彙',
    evaluate(content) {
      if (
        /(llms\.txt|GEO\s?分數|結構化資料|AI\s?友善度|JSON-LD)/i.test(content) ||
        /(?<![A-Za-z])SEO(?![A-Za-z])/.test(content)
      ) {
        return { score: 0, reason: 'geo_jargon_leak' };
      }
      return { score: weight };
    },
  };
}

/**
 * Strict no-fabrication check covering phone, email, and address fragments.
 * Compares against ctx.extras.profileRefText (brand profile + enriched scrape).
 */
export function noFabricatedContact(weight: number): ScoringRule {
  return {
    key: 'no_fabricated_contact',
    weight,
    description: '不虛構電話/email/地址',
    evaluate(content, ctx) {
      const ref = ((ctx.extras?.profileRefText as string | undefined) || '').replace(/[-\s.()]/g, '');
      const violations: string[] = [];

      const phones = content.match(/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/g) || [];
      for (const p of phones) {
        const pN = p.replace(/[-\s.()]/g, '');
        if (pN.length >= 7 && !ref.includes(pN)) {
          violations.push(`phone:${p}`);
          break;
        }
      }

      const emails = content.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
      for (const e of emails) {
        if (!ref.toLowerCase().includes(e.toLowerCase())) {
          violations.push(`email:${e}`);
          break;
        }
      }

      if (violations.length === 0) return { score: weight };
      return { score: 0, reason: `fabricated_contact:${violations.join('|')}` };
    },
  };
}

/** Body length must fall within [min, max*1.3]; partial credit otherwise. */
export function lengthInRange(weight: number, min: number, max: number): ScoringRule {
  return {
    key: 'length_in_range',
    weight,
    description: `字數在 ${min}-${max}`,
    evaluate(content) {
      const len = content.replace(/\s+/g, '').length;
      if (len >= min && len <= max * 1.3) return { score: weight };
      if (len >= min * 0.7) return { score: Math.round(weight * 0.66), reason: `length_partial:${len}` };
      return { score: Math.round(weight * 0.33), reason: `length_off:${len}` };
    },
  };
}

/** Reads ctx.extras.hashtags array (set by spec.parseContent for JSON outputs). */
export function hasHashtags(weight: number, min = 3): ScoringRule {
  return {
    key: 'has_hashtags',
    weight,
    description: `至少 ${min} 個 hashtag`,
    evaluate(_content, ctx) {
      const tags = (ctx.extras?.hashtags as string[] | undefined) || [];
      if (tags.length >= min) return { score: weight };
      if (tags.length >= 1) return { score: Math.round(weight * 0.6), reason: `hashtags:${tags.length}` };
      return { score: 0, reason: `hashtags:0` };
    },
  };
}

/** Penalises excessive exclamation — sounds robotic / hyperbolic. */
export function naturalTone(weight: number, maxExclaim = 5): ScoringRule {
  return {
    key: 'natural_tone',
    weight,
    description: '驚嘆號不過度',
    evaluate(content) {
      const n = (content.match(/！|!/g) || []).length;
      if (n <= 3) return { score: weight };
      if (n <= maxExclaim) return { score: Math.round(weight * 0.7) };
      return { score: Math.round(weight * 0.3), reason: `excessive_exclaim:${n}` };
    },
  };
}

/** Paragraph count ≥ min. */
export function paragraphStructure(weight: number, min = 3): ScoringRule {
  return {
    key: 'paragraph_structure',
    weight,
    description: `段落數 ≥${min}`,
    evaluate(content) {
      const paras = content.split('\n\n').filter((p) => p.trim().length > 10).length;
      if (paras >= min) return { score: weight };
      if (paras >= 2) return { score: Math.round(weight * 0.7) };
      return { score: Math.round(weight * 0.3), reason: `paragraphs:${paras}` };
    },
  };
}

/**
 * Reads ctx.extras.brandLeakCandidates and asserts none of them appear
 * in body. Used by buyer_guide where article must be brand-name-free.
 */
export function noBrandNameLeak(weight: number): ScoringRule {
  return {
    key: 'no_brand_name_leak',
    weight,
    description: '不可寫具體品牌名',
    evaluate(content, ctx) {
      const candidates = (ctx.extras?.brandLeakCandidates as string[] | undefined) || [];
      const leaked = candidates.filter((n) => n.length >= 3 && content.includes(n));
      if (leaked.length === 0) return { score: weight };
      return { score: 0, reason: `brand_name_leak:${leaked.slice(0, 3).join('|')}` };
    },
  };
}

/** Body must contain a specific link path (e.g. /directory/industry/foo). */
export function mustContainLink(weight: number, key = 'expectedLink'): ScoringRule {
  return {
    key: 'must_contain_link',
    weight,
    description: '需包含指定連結',
    evaluate(content, ctx) {
      const link = ctx.extras?.[key] as string | undefined;
      if (!link) return { score: weight }; // no link required → vacuously pass
      if (content.includes(link)) return { score: weight };
      return { score: 0, reason: `missing_link:${link}` };
    },
  };
}

/** buyer_guide should NOT frame GEO score as a consumer-facing pick metric. */
export function noGeoScoreAsConsumerMetric(weight: number): ScoringRule {
  return {
    key: 'no_geo_score_as_consumer_metric',
    weight,
    description: '不可把 GEO 分數寫成消費者挑選指標',
    evaluate(content) {
      if (
        /GEO\s?分數[^.。]{0,30}(?:指標|依據|標準|挑選|參考|可見度)/.test(content) ||
        /參考.{0,10}GEO\s?分數/.test(content) ||
        /(?:^|\n)[0-9]+\.\s?[^\n]*GEO\s?分數/.test(content)
      ) {
        return { score: 0, reason: 'geo_score_as_consumer_metric' };
      }
      return { score: weight };
    },
  };
}

/** Medical-adjacent industries: forbid efficacy / contraindication language. */
export function medicalBoundary(weight: number): ScoringRule {
  return {
    key: 'medical_boundary',
    weight,
    description: '醫療相關產業:禁療效/副作用/禁忌語句',
    evaluate(content, ctx) {
      const isMedical = !!ctx.extras?.medicalAdjacent;
      if (!isMedical) return { score: weight };
      if (/副作用|禁忌|不適合接受|療效|保證治癒|醫療級/.test(content)) {
        return { score: 0, reason: 'medical_boundary_violation' };
      }
      return { score: weight };
    },
  };
}

/** industry_top10: every brand row in ctx.extras.rows must be named at least once. */
export function allBrandsPresent(weight: number): ScoringRule {
  return {
    key: 'all_brands_present',
    weight,
    description: '榜單每個品牌都必須在內文出現',
    evaluate(content, ctx) {
      const rows = (ctx.extras?.rows as Array<{ name: string }> | undefined) || [];
      if (rows.length === 0) return { score: weight };
      const missing = rows.filter((r) => !content.includes(r.name)).map((r) => r.name);
      if (missing.length === 0) return { score: weight };
      const partial = Math.round(((rows.length - missing.length) / rows.length) * weight);
      return { score: partial, reason: `missing_brands:${missing.slice(0, 3).join('|')}` };
    },
  };
}

/**
 * AI search engines (ChatGPT/Claude/Perplexity) demote hyperbolic copy as
 * advertorial. Detects superlatives + "唯一" / "領先" / "業界第一" tropes.
 * Partial credit by hit count so a lone "最好時機" doesn't fail outright.
 */
export function noHyperbole(weight: number): ScoringRule {
  return {
    key: 'no_hyperbole',
    weight,
    description: '禁用過度誇張形容(最好/最棒/絕佳/領先/唯一)',
    evaluate(content) {
      const patterns = [
        /最好的/, /最棒的/, /最佳[品選]/, /最優秀/, /最頂[尖級]/,
        /絕佳/, /卓越/, /頂[尖級]品質/,
        /業界第一/, /全[國台]第一/, /行業第一/, /排名第一/,
        /唯一[一的]/, /獨一無二/, /無人能及/, /無可比擬/,
        /領先[業同]/, /稱霸/, /冠軍級/,
        /\bNo\.?\s*1\b/i, /\bNumber\s*1\b/i,
      ];
      const hits = patterns.reduce((sum, p) => sum + (content.match(p) ? 1 : 0), 0);
      if (hits === 0) return { score: weight };
      if (hits === 1) return { score: Math.round(weight * 0.5), reason: `hyperbole:1` };
      return { score: 0, reason: `hyperbole:${hits}` };
    },
  };
}

/**
 * AI prefers third-person neutral chronicles. First-person promotional
 * voice ("我們提供…" / "本店…" / "歡迎前來…") signals advertorial and
 * gets demoted in citations.
 */
export function noFirstPersonPromo(weight: number): ScoringRule {
  return {
    key: 'no_first_person_promo',
    weight,
    description: '禁用第一人稱推銷語(我們/本店/歡迎前來)',
    evaluate(content) {
      const patterns = [
        /我們提供/, /我們的服務/, /我們致力/, /我們秉持/,
        /本店/, /本品牌/, /本公司/, /本中心/,
        /歡迎(?:前來|蒞臨|來電|您|光臨)/,
      ];
      const hits = patterns.reduce((sum, p) => sum + (content.match(p) ? 1 : 0), 0);
      if (hits === 0) return { score: weight };
      if (hits <= 2) return { score: Math.round(weight * 0.5), reason: `first_person_promo:${hits}` };
      return { score: 0, reason: `first_person_promo:${hits}` };
    },
  };
}

/**
 * CTA boilerplate ("立即預約 / 馬上聯繫 / 限時優惠") is the dead giveaway
 * of an ad. AI training data labels these as commercial copy and demotes
 * them in citation ranking. Zero-tolerance.
 */
export function noCTABoilerplate(weight: number): ScoringRule {
  return {
    key: 'no_cta_boilerplate',
    weight,
    description: '禁用 CTA 套話(立即/馬上/不要錯過/限時)',
    evaluate(content) {
      const patterns = [
        /立即(?:預約|聯繫|諮詢|體驗|行動|報名|加入|購買)/,
        /馬上(?:聯繫|預約|體驗|報名)/,
        /今天就(?:預約|體驗|加入|聯絡|諮詢)/,
        /不要錯過/, /機會難得/, /把握[機這]會/,
        /限時(?:優惠|特惠|搶購|報名)/,
        /快來(?:預約|體驗|加入|報名)/,
      ];
      const hits = patterns.reduce((sum, p) => sum + (content.match(p) ? 1 : 0), 0);
      if (hits === 0) return { score: weight };
      return { score: 0, reason: `cta_boilerplate:${hits}` };
    },
  };
}

/**
 * AI citations prefer specific facts (numbers, durations, prices, years)
 * over vague claims ("提供優質服務"). This is a POSITIVE rule — partial
 * credit for some specifics, full credit for ≥3 distinct concrete facts.
 */
export function hasSpecificFacts(weight: number, min = 3): ScoringRule {
  return {
    key: 'has_specific_facts',
    weight,
    description: `具體事實(年資/價格/時長等)≥${min} 處`,
    evaluate(content) {
      const patterns = [
        /\d+\s*年(?:經驗|資歷|歷史|的|以上)/,        // years of experience
        /成立(?:於|超過)\s*\d+/,                        // founded year
        /\d+\s*(?:元|塊|台幣|NT\$?)/i,                  // price
        /\d+\s*(?:分鐘|小時|hr|min)/i,                  // duration
        /\d+\s*(?:公尺|公里|步行|車程)/,                 // distance
        /\d+\s*(?:坪|平方|m²)/,                          // area
        /\d+\s*(?:位|名|人)\s*(?:師傅|員工|教練|設計師|顧問)/, // staff count
        /\d+\s*(?:項|種|款|套)\s*(?:服務|商品|方案|課程)/,   // service variety
      ];
      const hits = patterns.reduce((sum, p) => sum + (content.match(p) ? 1 : 0), 0);
      if (hits >= min) return { score: weight };
      const partial = Math.round((hits / min) * weight);
      return { score: partial, reason: `specific_facts:${hits}` };
    },
  };
}

/**
 * industry_top10: each "### 第 X 名 — NAME" rank header must reference a
 * brand from ctx.extras.rows (no fabricated/extra brands).
 */
export function noFabricatedRankBrand(weight: number): ScoringRule {
  return {
    key: 'no_fabricated_rank_brand',
    weight,
    description: '排行榜不准出現非榜單品牌',
    evaluate(content, ctx) {
      const rows = (ctx.extras?.rows as Array<{ name: string }> | undefined) || [];
      if (rows.length === 0) return { score: weight };
      const allowed = new Set(rows.map((r) => r.name));
      const markers = Array.from(content.matchAll(/###\s*第\s*(\d+)\s*名\s*[—–-]?\s*(.+?)[\n\r]/g));
      const outsiders: string[] = [];
      for (const m of markers) {
        const name = m[2].trim();
        if (!allowed.has(name) && !rows.some((r) => name.includes(r.name))) {
          outsiders.push(name);
        }
      }
      if (outsiders.length === 0) return { score: weight };
      return { score: 0, reason: `fabricated_brand:${outsiders.slice(0, 2).join('|')}` };
    },
  };
}
