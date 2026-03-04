/**
 * Smart brand mention detection.
 * Checks if AI response text mentions the brand by:
 * 1. Full brand name match
 * 2. Each word/segment of the brand name (e.g. "蝦皮購物網" → ["蝦皮", "購物網"])
 * 3. URL domain match (e.g. "shopee.tw" → "shopee")
 * 4. Full URL match
 */
export function matchBrand(
  text: string,
  brandName: string,
  brandUrl: string,
): { mentioned: boolean; position: number | null } {
  const lowerText = text.toLowerCase();

  // Build keyword list from brand name
  const keywords: string[] = [brandName.toLowerCase()];

  // Split Chinese/English brand name into segments (2+ chars)
  // e.g. "蝦皮購物網" → ["蝦皮", "購物", "購物網"]
  // e.g. "立如整復" → ["立如", "整復", "立如整復"]
  const chineseSegments = brandName.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seg of chineseSegments) {
    if (seg.length >= 2) keywords.push(seg.toLowerCase());
    // Also try 2-char sub-segments for longer words
    if (seg.length > 2) {
      keywords.push(seg.substring(0, 2).toLowerCase());
    }
  }

  // Extract English words
  const englishWords = brandName.match(/[a-zA-Z]{2,}/gi) || [];
  for (const w of englishWords) {
    keywords.push(w.toLowerCase());
  }

  // Extract domain from URL (e.g. "https://shopee.tw/" → "shopee")
  try {
    const url = new URL(brandUrl);
    const hostParts = url.hostname.replace('www.', '').split('.');
    if (hostParts[0] && hostParts[0].length >= 3) {
      keywords.push(hostParts[0].toLowerCase());
    }
  } catch {
    // invalid URL, skip
  }

  // Also check full URL
  if (brandUrl) {
    keywords.push(brandUrl.toLowerCase());
  }

  // Deduplicate
  const uniqueKeywords = [...new Set(keywords)].filter((k) => k.length >= 2);

  // Check if any keyword is mentioned
  for (const keyword of uniqueKeywords) {
    const idx = lowerText.indexOf(keyword);
    if (idx !== -1) {
      const position = Math.ceil(((idx + 1) / text.length) * 10);
      return { mentioned: true, position: Math.min(position, 10) };
    }
  }

  return { mentioned: false, position: null };
}
