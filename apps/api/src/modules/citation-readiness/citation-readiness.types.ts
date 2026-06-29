// Citation-Readiness Gate (CRG) — shared types.
// See docs/citation-readiness-gate.md for the full spec.

export type CitationVerdict = 'ready' | 'repair' | 'reject';

/** Inputs the gate needs to assess one article. Pure — no DB/Nest coupling. */
export interface CitationReadinessInput {
  content: string;
  brandName: string;
  siteUrl: string;
  industry?: string;
  /** Brand-owned reference text (verified facts + contact + profile) — the
   * entity lint matches contact details and the judge grounds against this. */
  profileRefText: string;
  /** Already-published article bodies for the same site (dedup corpus). */
  existingCorpus: string[];
}

export interface DedupResult {
  score: number;
  against: 'existing' | 'none';
  isDuplicate: boolean;
}

export interface EntityResult {
  score: number;
  brandPresent: boolean;
  officialUrlPresent: boolean;
  fabricatedContact: string[];
  contradictions: string[];
  hardFail: boolean;
}

export interface JudgeResult {
  overall: number;
  answerFirst: number;
  extractable: number;
  queryMatch: number;
  specificity: number;
  citationSafety: number;
  targetQueries: string[];
  factContradictions: string[];
  weakestPassage: string;
  suggestedRewrite: string;
  /** false when the LLM call failed — caller treats as non-blocking. */
  ok: boolean;
  error?: string;
}

export interface CitationReadinessResult {
  verdict: CitationVerdict;
  score: number;
  dedup: DedupResult;
  entity: EntityResult;
  judge: JudgeResult;
  reasons: string[];
}

/** Composite-score pass threshold. Tunable. */
export const CRG_PASS_THRESHOLD = 78;
