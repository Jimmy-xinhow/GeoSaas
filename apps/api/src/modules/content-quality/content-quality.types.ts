// Shared types for the content-quality runner.
//
// Every "generate an article" path in the codebase (client_daily/*,
// brand_showcase, brand_spread/*, industry_top10, buyer_guide,
// industry_insights) declares one ContentSpec and feeds it to
// ContentQualityRunner.run(). The runner does:
//
//   1. Pre-flight: cheap mini-model produces an outline; outlineRules score
//      it; outline-fail re-rolls outline up to maxOutlineRetries.
//   2. Generate:   outline-pass triggers full-model body generation; rules
//      score the result.
//   3. Patch:      score < passThreshold triggers patch retries — model is
//      shown the previous draft + the failed-rule list and asked to fix in
//      place (cheaper than full rewrite). Up to maxPatchRetries.
//   4. Reject:     all retries exhausted → return rejected; caller decides
//      whether to persist a draft or drop.
//
// Every attempt — pass OR fail, every stage — writes one ArticleQualityLog
// row, so the prompt-tuning dashboard can compute pass-rate per
// (templateType, promptVersion) and rank the top-N failed rules.

export type Stage = 'outline' | 'full' | 'patch';

export interface RuleContext {
  siteName: string;
  industry?: string;
  // Free-form bag for spec-specific values (niche keywords, forbidden phrases,
  // expected services list, etc). Each rule reaches in for what it needs.
  extras?: Record<string, unknown>;
}

export interface RuleResult {
  // 0..weight inclusive. A rule that scores 0 of weight=20 has fully failed.
  score: number;
  // Human-readable single-line reason when score < weight. Format suggestion:
  // "key:value" so DB queries can split it cheaply (e.g. "brand_saturation:7").
  reason?: string;
}

export interface ScoringRule {
  key: string;          // stable identifier; used as JSON key in ruleScores
  weight: number;       // 0..100; sum of all rule weights in a spec should be 100
  description?: string; // shown in admin dashboard
  evaluate(content: string, ctx: RuleContext): RuleResult | Promise<RuleResult>;
}

export interface BuildPromptArgs<T = unknown> {
  ctx: RuleContext;
  data: T;              // spec-specific data (site profile, scan results, etc.)
}

export interface BuildPatchPromptArgs<T = unknown> extends BuildPromptArgs<T> {
  previousContent: string;
  failedRules: string[]; // raw reason strings from the last attempt
}

export interface ContentSpec<T = unknown> {
  templateType: string;     // e.g. "client_daily/tue_qa_deepdive"
  promptVersion: string;    // bump on material prompt change

  // ─── Stage 1 (optional) ──────────────────────────────────────
  outlineModel?: string;          // default: gpt-4o-mini
  buildOutlinePrompt?(args: BuildPromptArgs<T>): string;
  outlineRules?: ScoringRule[];
  outlineThreshold?: number;      // default: 60
  maxOutlineRetries?: number;     // default: 2
  outlineMaxTokens?: number;      // default: 600

  // ─── Stage 2 (required) ──────────────────────────────────────
  fullModel: string;              // e.g. gpt-4o
  buildFullPrompt(args: BuildPromptArgs<T> & { outline?: string }): string;
  fullMaxTokens?: number;         // default: 2000
  // OpenAI response_format hint (json_object | text). Default: text.
  fullResponseFormat?: 'text' | 'json_object';

  // For JSON-output paths (e.g. brand_spread): given the raw model output,
  // return the body text the rules should score against, and optionally
  // mutate ctx.extras with parsed fields (e.g. hashtags). When omitted, the
  // raw output is passed straight to rules.
  parseContent?(raw: string, ctx: RuleContext): string;

  // ─── Stage 3 ─────────────────────────────────────────────────
  rules: ScoringRule[];
  passThreshold: number;          // 0..100
  maxFullRetries?: number;        // default: 1 (patch is preferred over full re-gen)
  maxPatchRetries?: number;       // default: 2
  buildPatchPrompt?(args: BuildPatchPromptArgs<T>): string;
  patchMaxTokens?: number;        // default: 1500
}

export interface AttemptLogEntry {
  templateType: string;
  promptVersion: string;
  stage: Stage;
  attempt: number;
  passed: boolean;
  totalScore: number;
  ruleScores: Record<string, number>;
  failedRules: string[];
  model: string;
  charCount: number;
  tokensIn?: number;
  tokensOut?: number;
  durationMs: number;
}

export interface RunOutcome {
  status: 'generated' | 'rejected';
  content?: string;
  totalScore?: number;
  failedRules?: string[];
  attempts: AttemptLogEntry[]; // every attempt across all 3 stages
}
