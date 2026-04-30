import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AttemptLogEntry,
  BuildPatchPromptArgs,
  BuildPromptArgs,
  ContentSpec,
  RuleContext,
  RunOutcome,
  ScoringRule,
  Stage,
} from './content-quality.types';

@Injectable()
export class ContentQualityRunner {
  private readonly logger = new Logger(ContentQualityRunner.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  /**
   * Run a ContentSpec through the 3-stage pipeline. Every attempt is logged
   * to ArticleQualityLog. The caller decides what to do with the returned
   * content (write to BlogArticle, attach to whatever record, etc.) and
   * passes back the resulting articleId via attachArticleId() so the logs
   * can be backfilled with the article relation.
   */
  async run<T>(
    spec: ContentSpec<T>,
    data: T,
    ctx: RuleContext,
    siteId?: string,
  ): Promise<RunOutcome> {
    if (!this.openai) {
      throw new Error('ContentQualityRunner: OPENAI_API_KEY not configured');
    }

    const attempts: AttemptLogEntry[] = [];

    // ─── Stage 1: Outline (optional) ──────────────────────────────────────
    let outline: string | undefined;
    if (spec.buildOutlinePrompt && spec.outlineRules?.length) {
      const outlineThreshold = spec.outlineThreshold ?? 60;
      const maxOutlineRetries = spec.maxOutlineRetries ?? 2;
      const outlineModel = spec.outlineModel ?? 'gpt-4o-mini';
      const outlineMaxTokens = spec.outlineMaxTokens ?? 600;

      for (let i = 0; i < maxOutlineRetries + 1; i++) {
        const prompt = spec.buildOutlinePrompt({ ctx, data });
        const { content, tokensIn, tokensOut, durationMs } = await this.callOpenAI(
          outlineModel,
          prompt,
          outlineMaxTokens,
        );
        const { totalScore, ruleScores, failedRules } = this.evaluate(
          content,
          spec.outlineRules,
          ctx,
        );
        const passed = totalScore >= outlineThreshold;
        const entry: AttemptLogEntry = {
          templateType: spec.templateType,
          promptVersion: spec.promptVersion,
          stage: 'outline',
          attempt: i + 1,
          passed,
          totalScore,
          ruleScores,
          failedRules,
          model: outlineModel,
          charCount: content.length,
          tokensIn,
          tokensOut,
          durationMs,
        };
        attempts.push(entry);
        await this.persistLog(entry, siteId, undefined);

        if (passed) {
          outline = content;
          break;
        }
        if (i === maxOutlineRetries) {
          // Outline never passed — proceed to full anyway with last outline,
          // because half-decent outline is usually better than no outline.
          outline = content;
        }
      }
    }

    // ─── Stage 2: Full ────────────────────────────────────────────────────
    const fullModel = spec.fullModel;
    const fullMaxTokens = spec.fullMaxTokens ?? 2000;
    const maxFullRetries = spec.maxFullRetries ?? 1;
    let bestContent = '';
    let bestScore = 0;
    let bestRuleScores: Record<string, number> = {};
    let bestFailed: string[] = [];

    for (let i = 0; i < maxFullRetries + 1; i++) {
      const prompt = spec.buildFullPrompt({ ctx, data, outline });
      const { content: rawContent, tokensIn, tokensOut, durationMs } = await this.callOpenAI(
        fullModel,
        prompt,
        fullMaxTokens,
        spec.fullResponseFormat,
      );
      const content = spec.parseContent ? spec.parseContent(rawContent, ctx) : rawContent;
      const { totalScore, ruleScores, failedRules } = this.evaluate(
        content,
        spec.rules,
        ctx,
      );
      const passed = totalScore >= spec.passThreshold;
      const entry: AttemptLogEntry = {
        templateType: spec.templateType,
        promptVersion: spec.promptVersion,
        stage: 'full',
        attempt: i + 1,
        passed,
        totalScore,
        ruleScores,
        failedRules,
        model: fullModel,
        charCount: content.length,
        tokensIn,
        tokensOut,
        durationMs,
      };
      attempts.push(entry);
      await this.persistLog(entry, siteId, undefined);

      if (passed) {
        return { status: 'generated', content, totalScore, attempts };
      }
      if (totalScore > bestScore) {
        bestContent = content;
        bestScore = totalScore;
        bestRuleScores = ruleScores;
        bestFailed = failedRules;
      }
    }

    // ─── Stage 3: Patch ───────────────────────────────────────────────────
    const maxPatchRetries = spec.maxPatchRetries ?? 2;
    const patchMaxTokens = spec.patchMaxTokens ?? 1500;
    if (spec.buildPatchPrompt && bestContent) {
      for (let i = 0; i < maxPatchRetries; i++) {
        const args: BuildPatchPromptArgs<T> = {
          ctx,
          data,
          previousContent: bestContent,
          failedRules: bestFailed,
        };
        const prompt = spec.buildPatchPrompt(args);
        const { content: rawContent, tokensIn, tokensOut, durationMs } = await this.callOpenAI(
          fullModel,
          prompt,
          patchMaxTokens,
          spec.fullResponseFormat,
        );
        const content = spec.parseContent ? spec.parseContent(rawContent, ctx) : rawContent;
        const { totalScore, ruleScores, failedRules } = this.evaluate(
          content,
          spec.rules,
          ctx,
        );
        const passed = totalScore >= spec.passThreshold;
        const entry: AttemptLogEntry = {
          templateType: spec.templateType,
          promptVersion: spec.promptVersion,
          stage: 'patch',
          attempt: i + 1,
          passed,
          totalScore,
          ruleScores,
          failedRules,
          model: fullModel,
          charCount: content.length,
          tokensIn,
          tokensOut,
          durationMs,
        };
        attempts.push(entry);
        await this.persistLog(entry, siteId, undefined);

        if (passed) {
          return { status: 'generated', content, totalScore, attempts };
        }
        if (totalScore > bestScore) {
          bestContent = content;
          bestScore = totalScore;
          bestRuleScores = ruleScores;
          bestFailed = failedRules;
        }
      }
    }

    return {
      status: 'rejected',
      content: bestContent || undefined,
      totalScore: bestScore,
      failedRules: bestFailed,
      attempts,
    };
  }

  /**
   * After the caller persists the generated content as a BlogArticle, call
   * this to back-fill the articleId on every attempt log row that belongs
   * to this run. Looks up the latest passed row for (templateType, siteId)
   * and walks backward via createdAt+templateType.
   */
  async attachArticleId(
    templateType: string,
    siteId: string | undefined,
    articleId: string,
    sinceDate: Date,
  ): Promise<void> {
    await this.prisma.articleQualityLog.updateMany({
      where: {
        templateType,
        siteId: siteId ?? null,
        articleId: null,
        createdAt: { gte: sinceDate },
      },
      data: { articleId },
    });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private async callOpenAI(
    model: string,
    prompt: string,
    maxTokens: number,
    responseFormat?: 'text' | 'json_object',
  ): Promise<{ content: string; tokensIn?: number; tokensOut?: number; durationMs: number }> {
    const t0 = Date.now();
    const response = await this.openai!.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
    });
    const content = response.choices[0]?.message?.content || '';
    return {
      content,
      tokensIn: response.usage?.prompt_tokens,
      tokensOut: response.usage?.completion_tokens,
      durationMs: Date.now() - t0,
    };
  }

  private evaluate(
    content: string,
    rules: ScoringRule[],
    ctx: RuleContext,
  ): {
    totalScore: number;
    ruleScores: Record<string, number>;
    failedRules: string[];
  } {
    const ruleScores: Record<string, number> = {};
    const failedRules: string[] = [];
    let totalScore = 0;

    for (const rule of rules) {
      const result = rule.evaluate(content, ctx);
      // Only sync rules supported in MVP — keep API simple. Async rules can be
      // promoted later when we need API-backed checks (e.g. fact-verify).
      if (result instanceof Promise) {
        throw new Error(
          `ContentQualityRunner: rule "${rule.key}" returned a Promise; async rules are not supported yet`,
        );
      }
      const score = Math.min(Math.max(0, result.score), rule.weight);
      ruleScores[rule.key] = score;
      totalScore += score;
      if (score < rule.weight && result.reason) {
        failedRules.push(result.reason);
      }
    }

    return { totalScore, ruleScores, failedRules };
  }

  private async persistLog(
    entry: AttemptLogEntry,
    siteId: string | undefined,
    articleId: string | undefined,
  ): Promise<void> {
    try {
      await this.prisma.articleQualityLog.create({
        data: {
          templateType: entry.templateType,
          promptVersion: entry.promptVersion,
          stage: entry.stage,
          attempt: entry.attempt,
          passed: entry.passed,
          totalScore: entry.totalScore,
          ruleScores: entry.ruleScores as object,
          failedRules: entry.failedRules,
          model: entry.model,
          charCount: entry.charCount,
          tokensIn: entry.tokensIn ?? null,
          tokensOut: entry.tokensOut ?? null,
          durationMs: entry.durationMs,
          siteId: siteId ?? null,
          articleId: articleId ?? null,
        },
      });
    } catch (err) {
      // Logging failures must never break the actual generation pipeline.
      this.logger.warn(
        `Failed to persist quality log (${entry.templateType}/${entry.stage}): ${err}`,
      );
    }
  }
}
