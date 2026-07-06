/**
 * Smart brand mention detection (tightened to avoid citation-rate inflation).
 *
 * A response counts as "mentioned" only when:
 * 1. The full brand name appears; or
 * 2. The site's URL host appears (e.g. "shopee.tw") — strong match; or
 * 3. The full brand URL appears; or
 * 4. A distinctive partial segment appears: contiguous CJK run of >= 3 chars
 *    (or English word of >= 4 chars) from the brand name that is NOT a generic
 *    term. 2-char CJK fragments (e.g. 「蝦皮購物網」→「購物」) are no longer
 *    accepted — they caused false positives on generic vocabulary.
 */

/** Generic terms that must never count as a brand mention on their own. */
const GENERIC_TERMS = new Set([
  // CJK generic words (3+ chars; 2-char fragments are excluded by length rule)
  '有限公司',
  '股份有限公司',
  '工作室',
  '事務所',
  '購物網',
  '購物中心',
  '生活館',
  '專賣店',
  '旗艦店',
  '服務中心',
  '科技公司',
  '國際公司',
  '企業社',
  '商行網',
  '官方網站',
  '網路商店',
  '線上商店',
  // English generic words
  'shop',
  'store',
  'online',
  'official',
  'company',
  'group',
  'studio',
  'global',
  'taiwan',
  'service',
  'services',
  'tech',
  'technology',
  'digital',
  'brand',
  'best',
  'home',
  'life',
  'world',
  'international',
]);

const CJK_RUN_REGEX = /[一-鿿]{3,}/g;
const ENGLISH_WORD_REGEX = /[a-zA-Z]{4,}/g;

function toPosition(text: string, idx: number): number {
  const position = Math.ceil(((idx + 1) / text.length) * 10);
  return Math.min(position, 10);
}

export function matchBrand(
  text: string,
  brandName: string,
  brandUrl: string,
): { mentioned: boolean; position: number | null } {
  if (!text) return { mentioned: false, position: null };

  const lowerText = text.toLowerCase();
  const keywords: string[] = [];

  // (a) Full brand name — always a valid match
  const fullName = brandName.trim().toLowerCase();
  if (fullName.length >= 2) keywords.push(fullName);

  // (c) URL host — strong match (e.g. "shopee.tw", with or without www)
  try {
    const host = new URL(brandUrl).hostname.toLowerCase();
    const bareHost = host.replace(/^www\./, '');
    keywords.push(host);
    if (bareHost !== host) keywords.push(bareHost);
  } catch {
    // invalid URL, skip
  }

  // Full URL match
  if (brandUrl) keywords.push(brandUrl.toLowerCase());

  // (b) Distinctive partial segments only:
  // CJK runs of >= 3 chars and English words of >= 4 chars, excluding generic terms.
  const cjkRuns = brandName.match(CJK_RUN_REGEX) || [];
  for (const seg of cjkRuns) {
    const lower = seg.toLowerCase();
    if (lower !== fullName && !GENERIC_TERMS.has(lower)) keywords.push(lower);
  }

  const englishWords = brandName.match(ENGLISH_WORD_REGEX) || [];
  for (const w of englishWords) {
    const lower = w.toLowerCase();
    if (lower !== fullName && !GENERIC_TERMS.has(lower)) keywords.push(lower);
  }

  // Deduplicate
  const uniqueKeywords = [...new Set(keywords)].filter((k) => k.length >= 2);

  for (const keyword of uniqueKeywords) {
    const idx = lowerText.indexOf(keyword);
    if (idx !== -1) {
      return { mentioned: true, position: toPosition(text, idx) };
    }
  }

  return { mentioned: false, position: null };
}
