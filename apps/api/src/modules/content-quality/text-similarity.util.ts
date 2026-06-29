// Lightweight, dependency-free text-similarity for the FAQ content pipeline's
// pre-publish dedup. CJK has no word boundaries, so word-level Jaccard is
// useless on Traditional Chinese. We use character 3-gram (trigram) shingles
// over normalized text instead — a robust language-agnostic near-duplicate
// signal that catches the "same 6 facts reworded" failure mode that sank the
// old client_daily template assembler.
//
// No embeddings / no API calls: dedup must be cheap enough to run on every
// candidate before we spend a single publish, and it must work offline.

const SHINGLE_SIZE = 3;

/**
 * Strip markdown syntax, whitespace, and punctuation so cosmetic differences
 * (heading levels, bullet markers, spacing) don't hide real text overlap.
 * Keeps CJK ideographs, Latin letters, and digits — the actual information.
 */
export function normalizeForSimilarity(text: string): string {
  return (text || '')
    .toLowerCase()
    // drop fenced code / markdown emphasis / heading / list / link markers
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/[#>*_`~\-|=]/g, ' ')
    // keep CJK (incl. ext-A), Latin letters, digits; everything else -> gone
    .replace(/[^㐀-鿿 a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

/** Character n-gram shingle set over already-normalized text. */
function shingles(normalized: string, size = SHINGLE_SIZE): Set<string> {
  const set = new Set<string>();
  if (normalized.length < size) {
    if (normalized.length > 0) set.add(normalized);
    return set;
  }
  for (let i = 0; i <= normalized.length - size; i++) {
    set.add(normalized.slice(i, i + size));
  }
  return set;
}

/**
 * Jaccard similarity (|A∩B| / |A∪B|) of character-trigram shingle sets.
 * Returns 0..1. Two identical texts → 1; fully disjoint → 0.
 * Inputs are raw text (normalization happens inside).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const sa = shingles(normalizeForSimilarity(a));
  const sb = shingles(normalizeForSimilarity(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  // iterate the smaller set for the membership test
  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  for (const gram of small) {
    if (large.has(gram)) intersection++;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface MaxSimilarityResult {
  /** Highest Jaccard score against any corpus entry (0 when corpus empty). */
  score: number;
  /** Index of the most-similar corpus entry, or -1 when none. */
  matchedIndex: number;
}

/**
 * Best (highest) similarity of `candidate` against every text in `corpus`.
 * Used to compare a freshly generated FAQ article against (a) the site's
 * already-published articles and (b) the other candidates in the same batch.
 */
export function maxSimilarity(candidate: string, corpus: string[]): MaxSimilarityResult {
  let score = 0;
  let matchedIndex = -1;
  const candNorm = normalizeForSimilarity(candidate);
  if (!candNorm) return { score, matchedIndex };
  const candShingles = shingles(candNorm);
  if (candShingles.size === 0) return { score, matchedIndex };

  for (let i = 0; i < corpus.length; i++) {
    const other = shingles(normalizeForSimilarity(corpus[i]));
    if (other.size === 0) continue;
    let intersection = 0;
    const [small, large] = candShingles.size <= other.size ? [candShingles, other] : [other, candShingles];
    for (const gram of small) if (large.has(gram)) intersection++;
    const union = candShingles.size + other.size - intersection;
    const sim = union === 0 ? 0 : intersection / union;
    if (sim > score) {
      score = sim;
      matchedIndex = i;
    }
  }
  return { score, matchedIndex };
}

/** Default near-duplicate cutoff. Tunable per call-site. */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.5;
