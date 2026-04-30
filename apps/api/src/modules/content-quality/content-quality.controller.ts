import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';

interface TemplateAggregate {
  templateType: string;
  attempts: number;
  passRate: number;          // 0..1
  avgAttemptsToLand: number; // attempts per "first-pass" article (lower = better)
  avgScore: number;
  avgDurationMs: number;
  tokensIn: number;
  tokensOut: number;
  passed: number;
  failed: number;
}

interface FailedRuleStat {
  rule: string;              // bare rule key, e.g. "brand_saturation"
  count: number;
  percentOfFailed: number;   // 0..1 — share among failed attempts in this group
  examples: string[];        // up to 3 raw reason strings ("brand_saturation:7")
}

interface PromptVersionRow {
  promptVersion: string;
  attempts: number;
  passRate: number;
  avgScore: number;
}

@ApiTags('Admin — Content Quality')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/content-quality')
export class ContentQualityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('report')
  @ApiOperation({
    summary:
      'ArticleQualityLog 統計報告。回傳每 templateType 的 pass rate / 平均分 / token 用量,以及最常失敗的 rules,可用 ?templateType=... 過濾,?days=30 預設,?promptVersion=v1 比較版本。',
  })
  async report(
    @Query('templateType') templateType?: string,
    @Query('days') days?: string,
    @Query('promptVersion') promptVersion?: string,
  ): Promise<{
    rangeDays: number;
    since: string;
    templates: TemplateAggregate[];
    topFailedRules: FailedRuleStat[];
    promptVersions: PromptVersionRow[];
  }> {
    const rangeDays = Math.max(1, Math.min(365, parseInt(days ?? '30', 10) || 30));
    const since = new Date(Date.now() - rangeDays * 86400000);

    const where: Record<string, unknown> = { createdAt: { gte: since } };
    if (templateType) where.templateType = templateType;
    if (promptVersion) where.promptVersion = promptVersion;

    const logs = await this.prisma.articleQualityLog.findMany({
      where,
      select: {
        templateType: true,
        promptVersion: true,
        passed: true,
        totalScore: true,
        durationMs: true,
        tokensIn: true,
        tokensOut: true,
        failedRules: true,
        articleId: true,
      },
    });

    // ─── Per-templateType aggregate ─────────────────────────────────────
    const byTemplate = new Map<string, {
      n: number; passed: number; failed: number;
      score: number; ms: number; tokIn: number; tokOut: number;
      uniqueArticles: Set<string>;
    }>();
    for (const r of logs) {
      let bucket = byTemplate.get(r.templateType);
      if (!bucket) {
        bucket = { n: 0, passed: 0, failed: 0, score: 0, ms: 0, tokIn: 0, tokOut: 0, uniqueArticles: new Set() };
        byTemplate.set(r.templateType, bucket);
      }
      bucket.n++;
      if (r.passed) bucket.passed++; else bucket.failed++;
      bucket.score += r.totalScore;
      bucket.ms += r.durationMs;
      bucket.tokIn += r.tokensIn ?? 0;
      bucket.tokOut += r.tokensOut ?? 0;
      if (r.articleId) bucket.uniqueArticles.add(r.articleId);
    }

    const templates: TemplateAggregate[] = Array.from(byTemplate.entries())
      .map(([t, b]) => ({
        templateType: t,
        attempts: b.n,
        passRate: b.n ? b.passed / b.n : 0,
        avgAttemptsToLand: b.uniqueArticles.size ? b.n / b.uniqueArticles.size : 0,
        avgScore: b.n ? b.score / b.n : 0,
        avgDurationMs: b.n ? Math.round(b.ms / b.n) : 0,
        tokensIn: b.tokIn,
        tokensOut: b.tokOut,
        passed: b.passed,
        failed: b.failed,
      }))
      .sort((a, b) => a.passRate - b.passRate); // worst pass-rate first — these need prompt tuning

    // ─── Top failed rules ───────────────────────────────────────────────
    // Reasons are stored as "key:detail"; collapse to bare key for ranking.
    const ruleHits = new Map<string, { count: number; samples: string[] }>();
    let failedAttempts = 0;
    for (const r of logs) {
      if (r.passed) continue;
      failedAttempts++;
      const seen = new Set<string>();
      for (const raw of r.failedRules) {
        const key = raw.split(':')[0];
        if (seen.has(key)) continue; // count once per attempt
        seen.add(key);
        let bucket = ruleHits.get(key);
        if (!bucket) {
          bucket = { count: 0, samples: [] };
          ruleHits.set(key, bucket);
        }
        bucket.count++;
        if (bucket.samples.length < 3) bucket.samples.push(raw);
      }
    }
    const topFailedRules: FailedRuleStat[] = Array.from(ruleHits.entries())
      .map(([rule, b]) => ({
        rule,
        count: b.count,
        percentOfFailed: failedAttempts ? b.count / failedAttempts : 0,
        examples: b.samples,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ─── promptVersion comparison ───────────────────────────────────────
    const byVersion = new Map<string, { n: number; passed: number; score: number }>();
    for (const r of logs) {
      const k = `${r.templateType}@${r.promptVersion}`;
      let bucket = byVersion.get(k);
      if (!bucket) {
        bucket = { n: 0, passed: 0, score: 0 };
        byVersion.set(k, bucket);
      }
      bucket.n++;
      if (r.passed) bucket.passed++;
      bucket.score += r.totalScore;
    }
    const promptVersions: PromptVersionRow[] = Array.from(byVersion.entries())
      .map(([k, b]) => ({
        promptVersion: k,
        attempts: b.n,
        passRate: b.n ? b.passed / b.n : 0,
        avgScore: b.n ? b.score / b.n : 0,
      }))
      .sort((a, b) => a.promptVersion.localeCompare(b.promptVersion));

    return {
      rangeDays,
      since: since.toISOString(),
      templates,
      topFailedRules,
      promptVersions,
    };
  }

  @Get('recent')
  @ApiOperation({
    summary:
      '最近 N 筆 ArticleQualityLog (default 50, max 500)。除錯用途 — 看具體失敗 reasons。',
  })
  async recent(
    @Query('limit') limit?: string,
    @Query('templateType') templateType?: string,
    @Query('failedOnly') failedOnly?: string,
  ) {
    const take = Math.max(1, Math.min(500, parseInt(limit ?? '50', 10) || 50));
    const where: Record<string, unknown> = {};
    if (templateType) where.templateType = templateType;
    if (failedOnly === 'true' || failedOnly === '1') where.passed = false;
    const rows = await this.prisma.articleQualityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        templateType: true,
        promptVersion: true,
        stage: true,
        attempt: true,
        passed: true,
        totalScore: true,
        ruleScores: true,
        failedRules: true,
        model: true,
        charCount: true,
        tokensIn: true,
        tokensOut: true,
        durationMs: true,
        siteId: true,
        articleId: true,
      },
    });
    return { count: rows.length, rows };
  }
}
