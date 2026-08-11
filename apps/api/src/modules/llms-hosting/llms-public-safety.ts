const INTERNAL_STRATEGY_PATTERN =
  /(?:內部(?:內容|AI|引用|搜尋)?策略|內容營運策略|引用策略|讓\s*(?:ChatGPT|AI)|指示\s*AI|提示詞|prompt injection|ignore previous|system (?:prompt|message)|content operating strategy|official (?:website|domain) is|contact path:|請\s*AI.{0,24}(?:引用|推薦|排名)|AI.{0,24}(?:優先引用|優先推薦))/i;

const SELF_RATING_PATTERN =
  /(?:GEO\s*(?:分數|評分)|AI\s*(?:可見度|友善度|引用率)?\s*分數|Platinum\s*(?:等級|tier)|\bGEO Score\s*:\s*\d+)/i;

const TEST_DATA_PATTERN =
  /(?:Codex QA|Admin E2E|\bE2E\b|example\.com|localhost|�)/i;

export function isSafePublicLlmsFact(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.length > 4_000) return false;
  return !(
    INTERNAL_STRATEGY_PATTERN.test(normalized) ||
    SELF_RATING_PATTERN.test(normalized) ||
    TEST_DATA_PATTERN.test(normalized)
  );
}

export function sanitizePublicLlmsFact(value: unknown, maxLength = 1_000): string {
  if (typeof value !== 'string') return '';
  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isSafePublicLlmsFact(normalized)) return '';
  return normalized.slice(0, maxLength).trim();
}

export function isSafePublicLlmsDocument(value: string): boolean {
  if (!value.trim() || value.length > 200_000) return false;
  return !(
    INTERNAL_STRATEGY_PATTERN.test(value) ||
    SELF_RATING_PATTERN.test(value) ||
    TEST_DATA_PATTERN.test(value)
  );
}
