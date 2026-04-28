import { Injectable, Logger, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorService } from '../monitor/monitor.service';
import { PlanUsageService, PLAN_LIMITS } from '../../common/guards/plan.guard';
import pLimit from 'p-limit';

// 4-hour cooldown between runs of the SAME query set. Even with plan-level
// monthly quota, a client that hits the button accidentally shouldn't burn
// an entire slot. The cooldown is shorter than the existing 14-day cache
// so cache-hit path (free re-view) still works normally.
const QUERY_SET_COOLDOWN_MS = 4 * 60 * 60 * 1000;

interface QueryItem {
  category: string;
  question: string;
}

interface ReportResult {
  question: string;
  category: string;
  platform: string;
  mentioned: boolean;
  position: number | null;
  response: string;
}

@Injectable()
export class ClientReportService implements OnModuleInit {
  private readonly logger = new Logger(ClientReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitorService: MonitorService,
    private readonly planUsage: PlanUsageService,
  ) {}

  /** On startup, recover orphaned "running" reports */
  async onModuleInit() {
    const orphaned = await this.prisma.monitorReport.findMany({
      where: { status: { in: ['running', 'failed'] } },
      include: { querySet: { select: { queries: true } } },
    });

    let recovered = 0;
    let marked = 0;
    for (const report of orphaned) {
      const results = (report.results as any[]) || [];
      const expectedTotal = ((report.querySet?.queries as any[])?.length || 0) * 5;
      const isComplete = expectedTotal > 0 && results.length >= expectedTotal;

      if (isComplete) {
        // All questions processed — mark as completed
        const summary = report.summary || this.computeSummary(results);
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'completed', completedAt: report.completedAt || new Date(), summary: summary as any },
        });
        recovered++;
      } else {
        // Incomplete or empty — mark as failed so user can re-run
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'failed' },
        });
        marked++;
        if (results.length > 0) {
          this.logger.warn(`Report ${report.id} had ${results.length}/${expectedTotal} results — marked failed (incomplete)`);
        }
      }
    }
    if (recovered > 0) this.logger.log(`Recovered ${recovered} fully completed report(s)`);
    if (marked > 0) this.logger.warn(`Marked ${marked} incomplete/empty report(s) as failed`);
  }

  /**
   * Assert that the current user role can access a site's reports.
   * STAFF can only access isClient=true sites; ADMIN/SUPER_ADMIN can access any.
   */
  async assertSiteAccess(siteId: string, role: string): Promise<void> {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return;

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { isClient: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (role === 'STAFF' && !site.isClient) {
      throw new ForbiddenException('此網站不在您的權限範圍內');
    }
  }

  /**
   * Assert that the current user role can access a specific report.
   */
  async assertReportAccess(reportId: string, role: string): Promise<void> {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return;

    const report = await this.prisma.monitorReport.findUnique({
      where: { id: reportId },
      select: { siteId: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    await this.assertSiteAccess(report.siteId, role);
  }

  /** Create or update a client query set */
  async upsertQuerySet(siteId: string, name: string, queries: QueryItem[]) {
    const existing = await this.prisma.clientQuerySet.findFirst({
      where: { siteId, name },
    });

    if (existing) {
      return this.prisma.clientQuerySet.update({
        where: { id: existing.id },
        data: { queries: queries as any },
      });
    }

    return this.prisma.clientQuerySet.create({
      data: { siteId, name, queries: queries as any },
    });
  }

  /** Get all query sets for a site */
  async getQuerySets(siteId: string) {
    return this.prisma.clientQuerySet.findMany({
      where: { siteId },
      include: { reports: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  /** Run a full report: test all questions against all 5 platforms
   *  If a completed report exists within 14 days, return it directly
   */
  async runReport(querySetId: string, role?: string, userId?: string): Promise<{ reportId: string; cached?: boolean }> {
    const querySet = await this.prisma.clientQuerySet.findUnique({
      where: { id: querySetId },
      include: { site: true },
    });

    if (!querySet) throw new NotFoundException('Query set not found');

    if (role) {
      await this.assertSiteAccess(querySet.siteId, role);
    }

    // Check for recent completed report (within 14 days) — CACHE HIT is free
    // and doesn't count against quota, so check this first.
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentReport = await this.prisma.monitorReport.findFirst({
      where: {
        querySetId,
        status: 'completed',
        createdAt: { gte: fourteenDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentReport) {
      // Verify the cached report is actually complete
      const cachedResults = (recentReport.results as any[]) || [];
      const expectedTotal = (querySet.queries as any[]).length * 5;
      if (cachedResults.length >= expectedTotal) {
        this.logger.log(`Report cache hit: ${recentReport.id} (${recentReport.createdAt.toISOString().slice(0, 10)})`);
        return { reportId: recentReport.id, cached: true };
      }
      // Incomplete cached report — delete it and re-run
      this.logger.warn(`Cached report ${recentReport.id} incomplete (${cachedResults.length}/${expectedTotal}) — deleting and re-running`);
      await this.prisma.monitorReport.delete({ where: { id: recentReport.id } });
    }

    // NO CACHE HIT — this run will burn LLM credits. Gate it.
    // Resolve the acting user (for the plan check): prefer explicit userId
    // arg (passed from controller via @CurrentUser), fall back to site owner
    // when STAFF impersonates a client site.
    const actingUserId = userId ?? querySet.site.userId;
    const actingUser = await this.prisma.user.findUnique({
      where: { id: actingUserId },
      select: { id: true, plan: true, role: true },
    });

    // STAFF / ADMIN / SUPER_ADMIN bypass the quota, same pattern as PlanGuard.
    const bypassesQuota =
      actingUser &&
      (actingUser.role === 'STAFF' ||
        actingUser.role === 'ADMIN' ||
        actingUser.role === 'SUPER_ADMIN');

    if (actingUser && !bypassesQuota) {
      // Plan-level monthly quota (FREE=0 / STARTER=2 / PRO=3)
      const planKey = (actingUser.plan || 'FREE') as keyof typeof PLAN_LIMITS;
      const check = await this.planUsage.checkAndIncrement(
        actingUser.id,
        'reportsPerMonth',
        planKey,
        actingUser.role,
      );
      if (!check.allowed) {
        throw new ForbiddenException(
          `已達本月驗收報告配額（${check.used}/${check.limit}）。請等到下個月或升級方案。`,
        );
      }
    }

    // Per-querySet cooldown: a NON-cache-hit run within the last 4h means the
    // previous run failed or was deleted and the user is spamming. Hard stop.
    const cooldownSince = new Date(Date.now() - QUERY_SET_COOLDOWN_MS);
    const veryRecentRun = await this.prisma.monitorReport.findFirst({
      where: { querySetId, createdAt: { gte: cooldownSince } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, status: true },
    });
    if (veryRecentRun && !bypassesQuota) {
      const msUntilOk = veryRecentRun.createdAt.getTime() + QUERY_SET_COOLDOWN_MS - Date.now();
      const minutes = Math.ceil(msUntilOk / 60000);
      throw new ForbiddenException(
        `此問題集剛執行過(狀態: ${veryRecentRun.status})。請等 ${minutes} 分鐘後再試,或直接查看既有報告。`,
      );
    }

    const period = new Date().toISOString().slice(0, 7);

    const report = await this.prisma.monitorReport.create({
      data: {
        querySetId,
        siteId: querySet.siteId,
        period,
        results: [],
        status: 'running',
      },
    });

    // Run in background
    const expectedTotal = (querySet.queries as any[]).length * 5;
    this.executeReport(report.id, querySet.site, querySet.queries as unknown as QueryItem[]).catch(async (err) => {
      this.logger.error(`Report ${report.id} error: ${err}`);
      const current = await this.prisma.monitorReport.findUnique({ where: { id: report.id } });
      const results = (current?.results as any[]) || [];

      if (results.length >= expectedTotal) {
        // All questions were actually processed — mark as completed
        const summary = current?.summary || this.computeSummary(results);
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'completed', completedAt: new Date(), summary: summary as any },
        });
        this.logger.log(`Report ${report.id} error but all ${results.length}/${expectedTotal} results present — marked completed`);
      } else {
        // Incomplete — mark as failed so user can re-run
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'failed' },
        });
        this.logger.warn(`Report ${report.id} failed at ${results.length}/${expectedTotal} results`);
      }
    });

    return { reportId: report.id };
  }

  private async executeReport(reportId: string, site: { id: string; name: string; url: string }, queries: QueryItem[]) {
    const platforms = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];
    const results: ReportResult[] = [];

    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      this.logger.log(`Report ${reportId}: question ${qi + 1}/${queries.length} — ${q.question.slice(0, 30)}`);

      for (const platform of platforms) {
        let success = false;

        // Retry up to 2 times on failure (rate limit recovery)
        for (let attempt = 0; attempt < 2 && !success; attempt++) {
          try {
            const monitor = await this.prisma.monitor.create({
              data: { siteId: site.id, platform, query: q.question, checkedAt: new Date() },
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 30000),
            );
            const checked = await Promise.race([
              this.monitorService.checkCitation(monitor.id),
              timeoutPromise,
            ]);

            results.push({
              question: q.question,
              category: q.category,
              platform,
              mentioned: checked.mentioned,
              position: checked.position,
              response: checked.response?.slice(0, 500) || '',
            });

            await this.prisma.monitor.delete({ where: { id: monitor.id } }).catch(() => {});
            success = true;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (attempt === 0 && (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('overloaded'))) {
              // Rate limited — wait longer and retry
              this.logger.warn(`Rate limited on ${platform}, waiting 10s before retry...`);
              await new Promise((r) => setTimeout(r, 10000));
              continue;
            }
            results.push({
              question: q.question,
              category: q.category,
              platform,
              mentioned: false,
              position: null,
              response: `[Error] ${errMsg}`,
            });
            success = true; // Don't retry on non-rate-limit errors
          }
        }

        // Save after every platform call (real-time progress)
        await this.prisma.monitorReport.update({
          where: { id: reportId },
          data: { results: results as any },
        });

        // Delay between calls — Claude needs more time
        const delay = platform === 'CLAUDE' ? 4000 : 2000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Calculate summary
    const totalChecks = results.filter((r) => !r.response.startsWith('[Error]')).length;
    const mentionedCount = results.filter((r) => r.mentioned).length;
    const byPlatform: Record<string, { total: number; mentioned: number; rate: number }> = {};

    for (const platform of platforms) {
      const pResults = results.filter((r) => r.platform === platform && !r.response.startsWith('[Error]'));
      const pMentioned = pResults.filter((r) => r.mentioned).length;
      byPlatform[platform] = {
        total: pResults.length,
        mentioned: pMentioned,
        rate: pResults.length > 0 ? Math.round((pMentioned / pResults.length) * 100) : 0,
      };
    }

    const summary = {
      totalQueries: queries.length,
      totalChecks,
      mentionedCount,
      mentionRate: totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0,
      byPlatform,
    };

    await this.prisma.monitorReport.update({
      where: { id: reportId },
      data: {
        results: results as any,
        summary: summary as any,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    this.logger.log(`Report ${reportId} completed: ${mentionedCount}/${totalChecks} mentions (${summary.mentionRate}%)`);
  }

  /** Compute summary from results (used when recovery marks completed without summary) */
  private computeSummary(results: any[]) {
    const platforms = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];
    const totalChecks = results.filter((r) => !r.response?.startsWith('[Error]')).length;
    const mentionedCount = results.filter((r) => r.mentioned).length;
    const questions = new Set(results.map((r) => r.question));
    const byPlatform: Record<string, { total: number; mentioned: number; rate: number }> = {};

    for (const platform of platforms) {
      const pResults = results.filter((r) => r.platform === platform && !r.response?.startsWith('[Error]'));
      const pMentioned = pResults.filter((r) => r.mentioned).length;
      byPlatform[platform] = {
        total: pResults.length,
        mentioned: pMentioned,
        rate: pResults.length > 0 ? Math.round((pMentioned / pResults.length) * 100) : 0,
      };
    }

    return {
      totalQueries: questions.size,
      totalChecks,
      mentionedCount,
      mentionRate: totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0,
      byPlatform,
    };
  }

  /** Delete report */
  async deleteReport(reportId: string) {
    await this.prisma.monitorReport.delete({ where: { id: reportId } });
    return { deleted: true };
  }

  /** Get report by ID */
  async getReport(reportId: string) {
    return this.prisma.monitorReport.findUnique({
      where: { id: reportId },
      include: { site: { select: { name: true, url: true } }, querySet: { select: { name: true } } },
    });
  }

  /** Get all reports for a site */
  async getReports(siteId: string) {
    return this.prisma.monitorReport.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      include: { querySet: { select: { name: true } } },
    });
  }

  /** Generate PDF-ready HTML for a report */
  async getReportHtml(reportId: string): Promise<string> {
    const report = await this.prisma.monitorReport.findUnique({
      where: { id: reportId },
      include: { site: { select: { name: true, url: true, bestScore: true } }, querySet: { select: { name: true } } },
    });

    if (!report) throw new NotFoundException('Report not found');

    const results = report.results as unknown as ReportResult[];
    const summary = report.summary as any;
    const platforms = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];
    const platformLabels: Record<string, string> = {
      CHATGPT: 'ChatGPT', CLAUDE: 'Claude', PERPLEXITY: 'Perplexity', GEMINI: 'Gemini', COPILOT: 'Copilot',
    };

    // Group results by category
    const byCategory: Record<string, ReportResult[]> = {};
    results.forEach((r) => {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    });

    const platformSummaryHtml = platforms.map((p) => {
      const s = summary?.byPlatform?.[p] || { total: 0, mentioned: 0, rate: 0 };
      return `<div style="text-align:center;padding:12px;background:#f8f9fa;border-radius:8px;">
        <div style="font-size:24px;font-weight:bold;color:${s.rate >= 50 ? '#22c55e' : s.rate >= 20 ? '#eab308' : '#ef4444'}">${s.rate}%</div>
        <div style="font-size:12px;color:#6b7280">${platformLabels[p]}</div>
        <div style="font-size:11px;color:#9ca3af">${s.mentioned}/${s.total} 引用</div>
      </div>`;
    }).join('');

    const categoryHtml = Object.entries(byCategory).map(([cat, items]) => {
      const questions = new Set(items.map((i) => i.question));
      const questionRows = Array.from(questions).map((q) => {
        const qResults = items.filter((i) => i.question === q);
        const cells = platforms.map((p) => {
          const r = qResults.find((i) => i.platform === p);
          if (!r) return '<td style="text-align:center;padding:6px;">-</td>';
          return `<td style="text-align:center;padding:6px;color:${r.mentioned ? '#22c55e' : '#ef4444'}">${r.mentioned ? '✓' : '✗'}</td>`;
        }).join('');
        return `<tr><td style="padding:6px;font-size:13px;">${q}</td>${cells}</tr>`;
      }).join('');

      return `<h3 style="margin-top:24px;color:#1f2937;">${cat}</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead><tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:8px;font-size:12px;">問題</th>
            ${platforms.map((p) => `<th style="text-align:center;padding:8px;font-size:11px;">${platformLabels[p]}</th>`).join('')}
          </tr></thead>
          <tbody>${questionRows}</tbody>
        </table>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <title>${report.site.name} — AI 引用監控報告 ${report.period}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #1f2937; }
    table { border: 1px solid #e5e7eb; font-size: 13px; }
    th, td { border-bottom: 1px solid #e5e7eb; }
    h1 { color: #111827; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="margin-bottom:4px;">${report.site.name}</h1>
    <p style="color:#6b7280;">AI 引用監控月度報告 — ${report.period}</p>
    <p style="color:#9ca3af;font-size:12px;">Generated by Geovault · ${new Date().toLocaleDateString('zh-TW')}</p>
  </div>

  <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);padding:24px;border-radius:12px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:14px;color:#6b7280;">總引用率</div>
        <div style="font-size:48px;font-weight:bold;color:${summary?.mentionRate >= 50 ? '#22c55e' : '#3b82f6'}">${summary?.mentionRate || 0}%</div>
        <div style="font-size:13px;color:#6b7280;">${summary?.mentionedCount || 0} / ${summary?.totalChecks || 0} 次引用</div>
      </div>
      <div>
        <div style="font-size:14px;color:#6b7280;">GEO 分數</div>
        <div style="font-size:48px;font-weight:bold;color:#3b82f6;">${report.site.bestScore}</div>
        <div style="font-size:13px;color:#6b7280;">/100</div>
      </div>
    </div>
  </div>

  <h2>各平台引用率</h2>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:24px;">
    ${platformSummaryHtml}
  </div>

  <h2>問題明細</h2>
  ${categoryHtml}

  <div style="margin-top:40px;padding:20px;background:#f9fafb;border-radius:8px;text-align:center;">
    <p style="color:#6b7280;font-size:12px;">
      © ${new Date().getFullYear()} Geovault · Origin Code: GEOVAULT-2026-APAC-PRIME<br/>
      本報告由 Geovault 自動生成 · https://geovault.app
    </p>
  </div>
</body>
</html>`;
  }

  /**
   * Read-only quota probe for the UI — returns monthly cap / used / remaining
   * and the per-querySet cooldown for every querySet on a site. Lets the
   * front end disable the "一鍵查詢" button (and explain why) before the
   * user clicks and gets a 403 back.
   */
  async getQuotaStatus(siteId: string, userId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const actingUserId = userId || site.userId;
    const user = await this.prisma.user.findUnique({
      where: { id: actingUserId },
      select: { id: true, plan: true, role: true },
    });

    const planKey = (user?.plan || 'FREE') as keyof typeof PLAN_LIMITS;
    const limits = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.FREE;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const used = await this.prisma.monitorReport.count({
      where: { site: { userId: actingUserId }, createdAt: { gte: monthStart } },
    });

    const bypassesQuota =
      !!user &&
      (user.role === 'STAFF' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

    // Per-querySet cooldowns
    const querySets = await this.prisma.clientQuerySet.findMany({
      where: { siteId },
      select: {
        id: true,
        name: true,
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, status: true },
        },
      },
    });

    const now = Date.now();
    const cooldowns = querySets.map((qs) => {
      const latest = qs.reports[0];
      if (!latest) return { querySetId: qs.id, name: qs.name, cooldownUntil: null, canRun: true };
      const until = latest.createdAt.getTime() + QUERY_SET_COOLDOWN_MS;
      const canRun = bypassesQuota || now >= until;
      return {
        querySetId: qs.id,
        name: qs.name,
        cooldownUntil: canRun ? null : new Date(until).toISOString(),
        lastStatus: latest.status,
        canRun,
      };
    });

    return {
      plan: planKey,
      bypassesQuota,
      monthly: {
        used,
        limit: limits.reportsPerMonth,
        remaining: bypassesQuota ? -1 : Math.max(0, limits.reportsPerMonth - used),
      },
      cooldowns,
    };
  }

  // ─── 完整 GEO 報告匯出 ────────────────────────────────────────────
  //
  // Single HTML that renders GEO Comprehensive + latest citation report
  // together. User prints as PDF via browser Ctrl+P (same flow as the
  // existing single-report PDF). CSV variant returned by a sibling method.

  async getCompleteReportHtml(siteId: string): Promise<string> {
    const geo = await this.getGeoComprehensive(siteId);

    // Latest completed citation report for this site (may be none)
    const latestCitation = await this.prisma.monitorReport.findFirst({
      where: { siteId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      include: { querySet: { select: { name: true } } },
    });

    const { site, overview, scanTrend, indicators, crawler, content, peers, freshness } = geo;
    const today = new Date().toISOString().slice(0, 10);

    const scoreColor = (s: number) =>
      s >= 80 ? '#22c55e' : s >= 60 ? '#3b82f6' : s >= 40 ? '#eab308' : '#ef4444';
    const statusIcon = (s: string) =>
      s === 'pass' ? '✅' : s === 'warning' ? '⚠' : '✗';

    const trendHtml = scanTrend.length === 0
      ? '<p style="color:#6b7280">尚無掃描記錄</p>'
      : `<div style="display:flex;align-items:flex-end;gap:6px;height:80px;padding:8px 0;">
          ${scanTrend.map((s) => {
            const at = s.at ? new Date(s.at).toISOString().slice(0, 10) : '';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;" title="${at} · ${s.score}">
              <div style="width:100%;background:${scoreColor(s.score)};border-radius:3px 3px 0 0;height:${(s.score / 100) * 64}px;"></div>
              <span style="font-size:9px;color:#6b7280">${s.score}</span>
            </div>`;
          }).join('')}
        </div>`;

    const indicatorsHtml = indicators.length === 0
      ? '<p style="color:#6b7280;font-size:13px;">尚無 scan results(可能是舊版掃描或需要重新觸發掃描)</p>'
      : `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:6px;font-size:12px;">指標</th><th style="text-align:center;padding:6px;font-size:12px;">狀態</th><th style="text-align:right;padding:6px;font-size:12px;">分數</th></tr></thead>
          <tbody>${indicators.map((i) => `
            <tr><td style="padding:6px;font-size:13px;">${i.indicator}</td>
            <td style="text-align:center;padding:6px;">${statusIcon(i.status)}</td>
            <td style="text-align:right;padding:6px;color:${scoreColor(i.score)};font-weight:bold;">${i.score}</td></tr>`).join('')}</tbody>
        </table>`;

    const crawlerHtml = crawler.totalVisits === 0
      ? '<p style="color:#6b7280;font-size:13px;">近 90 天無 AI 爬蟲造訪記錄</p>'
      : `<p style="font-size:13px;color:#4b5563;">總造訪 <strong>${crawler.totalVisits}</strong> 次 / 近 90 天 <strong>${crawler.last90dVisits}</strong> 次</p>
         ${crawler.byBot.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">${crawler.byBot.map((b) => `<div style="padding:6px 10px;background:#eff6ff;border-radius:4px;font-size:12px;"><strong>${b.botName}</strong> <span style="color:#6b7280">(${b.botOrg})</span>: ${b.count}</div>`).join('')}</div>` : ''}`;

    const peersHtml = peers.length === 0 ? '' : `
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tbody>${peers.map((p, i) => `
          <tr style="${p.isMe ? 'background:#dbeafe;' : ''}">
            <td style="padding:6px;font-size:12px;width:40px;color:#6b7280;">#${i + 1}</td>
            <td style="padding:6px;font-size:13px;${p.isMe ? 'font-weight:bold;color:#1e40af;' : ''}">${p.name}${p.isMe ? ' ★ 本站' : ''}</td>
            <td style="text-align:right;padding:6px;color:${scoreColor(p.bestScore)};font-weight:bold;">${p.bestScore}</td>
          </tr>`).join('')}</tbody></table>`;

    // Citation report section (if available)
    let citationHtml = '<p style="color:#6b7280;font-size:13px;">尚未執行過 AI 引用驗收報告</p>';
    if (latestCitation) {
      const cres = (latestCitation.results as any as ReportResult[]) || [];
      const csum = latestCitation.summary as any;
      const platforms = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];
      const platformLabels: Record<string, string> = {
        CHATGPT: 'ChatGPT', CLAUDE: 'Claude', PERPLEXITY: 'Perplexity', GEMINI: 'Gemini', COPILOT: 'Copilot',
      };
      citationHtml = `
        <p style="color:#6b7280;font-size:12px;margin-bottom:12px;">
          問題集: <strong>${latestCitation.querySet?.name || '—'}</strong> ·
          執行時間: ${new Date(latestCitation.completedAt || latestCitation.createdAt).toISOString().slice(0, 10)} ·
          共 ${cres.length} 次查詢
        </p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
          ${platforms.map((p) => {
            const s = csum?.byPlatform?.[p] || { total: 0, mentioned: 0, rate: 0 };
            return `<div style="text-align:center;padding:10px;background:#f8f9fa;border-radius:6px;">
              <div style="font-size:22px;font-weight:bold;color:${scoreColor(s.rate)}">${s.rate}%</div>
              <div style="font-size:11px;color:#6b7280">${platformLabels[p]}</div>
              <div style="font-size:10px;color:#9ca3af">${s.mentioned}/${s.total}</div>
            </div>`;
          }).join('')}
        </div>`;

      // Category breakdown
      const byCat: Record<string, ReportResult[]> = {};
      cres.forEach((r) => {
        const k = r.category || '(未分類)';
        (byCat[k] = byCat[k] || []).push(r);
      });
      citationHtml += `<h4 style="margin-top:16px;font-size:14px;">類別表現</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:6px;">類別</th>
            <th style="text-align:right;padding:6px;">引用率</th>
            <th style="text-align:right;padding:6px;">已引用</th>
            <th style="text-align:right;padding:6px;">總數</th>
          </tr></thead><tbody>
          ${Object.entries(byCat).map(([cat, items]) => {
            const total = items.filter((r) => !r.response?.startsWith('[Error]')).length;
            const mentioned = items.filter((r) => r.mentioned).length;
            const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0;
            return `<tr><td style="padding:6px;">${cat}</td>
              <td style="text-align:right;padding:6px;color:${scoreColor(rate)};font-weight:bold;">${rate}%</td>
              <td style="text-align:right;padding:6px;">${mentioned}</td>
              <td style="text-align:right;padding:6px;">${total}</td></tr>`;
          }).join('')}
          </tbody></table>`;
    }

    return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="utf-8">
<title>${site.name} — Geovault 完整 GEO 報告 ${today}</title>
<style>
  @media print { .no-print{display:none;} body{background:white;} }
  body { font-family: "PingFang TC", "Noto Sans TC", system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #111827; background: #f9fafb; }
  h1 { font-size: 22px; border-bottom: 3px solid #3b82f6; padding-bottom: 8px; }
  h2 { font-size: 16px; margin-top: 24px; padding-left: 8px; border-left: 4px solid #3b82f6; }
  h3 { font-size: 14px; color: #374151; margin-top: 16px; }
  .section { background: white; padding: 16px 20px; border-radius: 8px; margin: 12px 0; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
  .card { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 6px; }
  .num { font-size: 26px; font-weight: bold; }
  .cap { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .freshness { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; margin-left: 6px; }
  .f-fresh { background: #dcfce7; color: #166534; }
  .f-ok { background: #dbeafe; color: #1e40af; }
  .f-stale { background: #fef3c7; color: #92400e; }
  .f-old { background: #fee2e2; color: #991b1b; }
</style></head><body>
<div class="no-print" style="background:#fbbf24;color:#78350f;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:13px;">
  💡 使用 Ctrl+P / ⌘+P 儲存為 PDF
</div>
<h1>${site.name} — Geovault 完整 GEO 報告</h1>
<p class="meta">
  產業: ${site.industry || '—'} · 官網: <a href="${site.url}">${site.url}</a> · 報告日期: ${today}
</p>

<div class="section">
  <h2>📊 GEO 總覽</h2>
  <div class="grid-4">
    <div class="card"><div class="num" style="color:${scoreColor(overview.currentScore)}">${overview.currentScore}</div><div class="cap">GEO 分數</div></div>
    <div class="card"><div class="num">${overview.industryRank ?? '—'}${overview.industryTotalSites ? `<span style="font-size:14px;color:#6b7280">/${overview.industryTotalSites}</span>` : ''}</div><div class="cap">產業排名</div></div>
    <div class="card"><div class="num">${overview.industryAvgScore ?? '—'}</div><div class="cap">產業平均</div></div>
    <div class="card"><div class="num" style="color:${crawler.totalVisits > 0 ? '#22c55e' : '#9ca3af'}">${crawler.totalVisits}</div><div class="cap">AI 爬蟲造訪</div></div>
  </div>
  <p class="meta" style="margin-top:12px;">
    最後掃描: ${overview.lastScannedAt ? new Date(overview.lastScannedAt).toISOString().slice(0, 10) : '—'}
    ${freshness.scanAsOf ? `<span class="freshness ${(() => {
      const days = Math.floor((Date.now() - new Date(freshness.scanAsOf).getTime()) / 86400000);
      return days < 1 ? 'f-fresh' : days < 14 ? 'f-ok' : days < 30 ? 'f-stale' : 'f-old';
    })()}">${(() => {
      const days = Math.floor((Date.now() - new Date(freshness.scanAsOf).getTime()) / 86400000);
      return days < 1 ? '今天' : `${days} 天前`;
    })()}</span>` : ''}
  </p>
</div>

<div class="section">
  <h2>📈 GEO 分數趨勢(最近 ${scanTrend.length} 次掃描)</h2>
  ${trendHtml}
</div>

<div class="section">
  <h2>🎯 9 項 GEO 指標</h2>
  ${indicatorsHtml}
</div>

<div class="section">
  <h2>🤖 AI 爬蟲活動(近 90 天)</h2>
  ${crawlerHtml}
</div>

<div class="section">
  <h2>📚 內容資產</h2>
  <table style="width:100%;font-size:13px;">
    <tr><td style="padding:6px;width:40%;color:#6b7280;">知識庫 Q&A</td><td style="padding:6px;"><strong>${content.knowledgeQaCount}</strong> 題</td></tr>
    <tr><td style="padding:6px;color:#6b7280;">品牌深度介紹(brand_showcase)</td><td style="padding:6px;">${content.brandShowcase ? `<a href="https://www.geovault.app/blog/${content.brandShowcase.slug}">已生成 →</a>` : '<span style="color:#eab308">⏳ 待生成</span>'}</td></tr>
    <tr><td style="padding:6px;color:#6b7280;">產業 Top 10 榜單</td><td style="padding:6px;">${content.industryTop10 ? `<a href="https://www.geovault.app/blog/${content.industryTop10.slug}">有榜單</a>${content.industryTop10.includedRank && content.industryTop10.includedRank <= 10 ? ` · 本站入榜 #${content.industryTop10.includedRank}` : ''}` : '<span style="color:#9ca3af">— 尚無</span>'}</td></tr>
  </table>
</div>

<div class="section">
  <h2>🏆 同業標竿 Top 5</h2>
  ${peersHtml}
</div>

<div class="section">
  <h2>📝 AI 引用驗收報告</h2>
  ${citationHtml}
</div>

<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
<p style="color:#6b7280;font-size:11px;text-align:center;">
  © ${new Date().getFullYear()} Geovault · Origin Code: GEOVAULT-2026-APAC-PRIME<br/>
  本報告由 Geovault 自動生成 · https://www.geovault.app
</p>
</body></html>`;
  }

  /**
   * CSV dump of the comprehensive report — for analysts who want to
   * pivot/chart/graph in Excel. Returns a single CSV string with
   * multiple sections separated by blank lines.
   */
  async getCompleteReportCsv(siteId: string): Promise<string> {
    const geo = await this.getGeoComprehensive(siteId);
    const latestCitation = await this.prisma.monitorReport.findFirst({
      where: { siteId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      include: { querySet: { select: { name: true } } },
    });

    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const row = (cells: unknown[]) => cells.map(esc).join(',') + '\n';

    // UTF-8 BOM for Excel correct CJK rendering
    let csv = '﻿';

    // Section 1: site overview
    csv += '# 網站資訊\n';
    csv += row(['欄位', '值']);
    csv += row(['名稱', geo.site.name]);
    csv += row(['官網', geo.site.url]);
    csv += row(['產業', geo.site.industry || '']);
    csv += row(['GEO 分數', geo.overview.currentScore]);
    csv += row(['tier', geo.overview.tier || '']);
    csv += row(['產業排名', geo.overview.industryRank || '']);
    csv += row(['產業總站數', geo.overview.industryTotalSites || '']);
    csv += row(['產業平均分數', geo.overview.industryAvgScore || '']);
    csv += row(['最後掃描時間', geo.overview.lastScannedAt || '']);
    csv += '\n';

    // Section 2: scan trend
    csv += '# GEO 分數趨勢\n';
    csv += row(['日期', '分數']);
    for (const s of geo.scanTrend) {
      const at = s.at ? new Date(s.at).toISOString().slice(0, 10) : '';
      csv += row([at, s.score]);
    }
    csv += '\n';

    // Section 3: indicators
    csv += '# 9 項 GEO 指標\n';
    csv += row(['指標', '分數', '狀態', '建議']);
    for (const i of geo.indicators) {
      csv += row([i.indicator, i.score, i.status, (i.suggestion || '').slice(0, 100)]);
    }
    csv += '\n';

    // Section 4: crawler
    csv += '# AI 爬蟲活動(近 90 天)\n';
    csv += row(['Bot', '組織', '訪問次數']);
    for (const b of geo.crawler.byBot) {
      csv += row([b.botName, b.botOrg, b.count]);
    }
    csv += '\n';

    // Section 5: peers
    csv += '# 同業標竿\n';
    csv += row(['排名', '品牌', '分數', '本站']);
    geo.peers.forEach((p, i) => {
      csv += row([i + 1, p.name, p.bestScore, p.isMe ? '★' : '']);
    });
    csv += '\n';

    // Section 6: citation results (if any)
    if (latestCitation) {
      const cres = (latestCitation.results as any as ReportResult[]) || [];
      csv += '# AI 引用驗收報告\n';
      csv += row(['問題集', latestCitation.querySet?.name || '']);
      csv += row(['執行日期', new Date(latestCitation.completedAt || latestCitation.createdAt).toISOString().slice(0, 10)]);
      csv += '\n';
      csv += row(['類別', '問題', '平台', '是否引用', '排名', 'AI 回應摘要']);
      for (const r of cres) {
        const resp = typeof r.response === 'string' ? r.response.replace(/\s+/g, ' ').slice(0, 300) : '';
        csv += row([
          r.category || '',
          r.question,
          r.platform,
          r.mentioned ? '是' : '否',
          r.position ?? '',
          resp,
        ]);
      }
    }

    return csv;
  }

  // ─── GEO 綜合體檢報告 ──────────────────────────────────────────────
  //
  // This is a wider lens than the query-set report. The query-set answers
  // "did AI mention this brand?" — this answers "what is the full GEO
  // health of this brand across scan / crawler / content / peers?".
  //
  // Five blocks, each pulled from existing tables with no new models:
  //   - overview:    current GEO score + level + tier + latest scan at
  //   - scanTrend:   last 10 COMPLETED scans (for sparkline)
  //   - indicators:  9 scan indicators on the most recent scan
  //   - crawler:     last-90-day crawler visits (by bot, by week, top pages)
  //   - content:     brand_showcase coverage + industry_top10 rank position
  //   - peers:       industry avg + top 5 by bestScore for comparison

  async getGeoComprehensive(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, tier: true,
        bestScore: true, bestScoreAt: true, isPublic: true, isClient: true,
        createdAt: true,
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

    const [
      latestScan,
      scanTrend,
      qaCount,
      brandShowcase,
      industryStats,
      peerTop,
      crawlerByBot,
      crawlerByWeek,
      crawlerTotalVisits,
      crawlerRecent,
      industryTop10Article,
    ] = await Promise.all([
      // Latest completed scan with full indicator breakdown
      this.prisma.scan.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        include: {
          results: {
            select: { indicator: true, score: true, status: true, suggestion: true },
          },
        },
      }),
      // Scan trend (last 10 completed)
      this.prisma.scan.findMany({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: { totalScore: true, completedAt: true },
      }),
      // Knowledge base coverage
      this.prisma.siteQa.count({ where: { siteId } }),
      // brand_showcase article presence
      this.prisma.blogArticle.findFirst({
        where: { siteId, templateType: 'brand_showcase', published: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, slug: true, title: true, createdAt: true, lastRegeneratedAt: true },
      }),
      // Industry aggregate
      site.industry
        ? this.prisma.site.aggregate({
            where: { industry: site.industry, isPublic: true, bestScore: { gt: 0 } },
            _avg: { bestScore: true },
            _count: { id: true },
          })
        : Promise.resolve(null),
      // Industry peers (top 5 by score, including this site)
      site.industry
        ? this.prisma.site.findMany({
            where: { industry: site.industry, isPublic: true, bestScore: { gt: 0 } },
            orderBy: { bestScore: 'desc' },
            take: 6,
            select: { id: true, name: true, bestScore: true, tier: true },
          })
        : Promise.resolve([]),
      // Crawler breakdown by bot (last 90d)
      this.prisma.crawlerVisit.groupBy({
        by: ['botName', 'botOrg'],
        where: { siteId, visitedAt: { gte: ninetyDaysAgo }, isSeeded: false },
        _count: true,
      }),
      // Crawler by week (last 90d, grouped into 13 weeks)
      this.prisma.crawlerVisit.findMany({
        where: { siteId, visitedAt: { gte: ninetyDaysAgo }, isSeeded: false },
        select: { visitedAt: true },
        orderBy: { visitedAt: 'asc' },
      }),
      this.prisma.crawlerVisit.count({
        where: { siteId, isSeeded: false },
      }),
      this.prisma.crawlerVisit.findMany({
        where: { siteId, isSeeded: false },
        orderBy: { visitedAt: 'desc' },
        take: 20,
        select: { botName: true, botOrg: true, url: true, visitedAt: true, statusCode: true },
      }),
      // Does the industry have a Top 10 ranking article? What rank is this site?
      site.industry
        ? this.prisma.blogArticle.findFirst({
            where: { templateType: 'industry_top10', industrySlug: site.industry, published: true },
            orderBy: { createdAt: 'desc' },
            select: { slug: true, title: true, createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    // Derive industry rank for this site (position in bestScore-DESC among
    // public industry peers). Cheap — we already have peerTop, just count
    // how many have a strictly higher score than ours.
    let industryRank: number | null = null;
    if (site.industry && site.bestScore != null) {
      const higher = await this.prisma.site.count({
        where: {
          industry: site.industry,
          isPublic: true,
          bestScore: { gt: site.bestScore },
        },
      });
      industryRank = higher + 1;
    }

    // ─── Geovault coverage — visits to articles WE published on the
    // client's behalf at /blog/<slug>. These visits are recorded with
    // siteId=Geovault (not the client's siteId), so the client's own
    // crawler block above shows 0 even when bots are actively crawling
    // their content. This block makes the value visible.
    const clientArticles = await this.prisma.blogArticle.findMany({
      where: { siteId, published: true },
      select: { slug: true, title: true, templateType: true, createdAt: true },
    });
    const slugList = clientArticles.map((a) => a.slug);
    const coverageVisits = slugList.length > 0
      ? await this.prisma.crawlerVisit.findMany({
          where: {
            isSeeded: false,
            OR: slugList.map((s) => ({ url: { contains: s } })),
          },
          select: { botName: true, botOrg: true, url: true, visitedAt: true, statusCode: true },
          orderBy: { visitedAt: 'desc' },
        })
      : [];

    const now = Date.now();
    const visitsLast24h = coverageVisits.filter((v) => v.visitedAt.getTime() > now - 86400000).length;
    const visitsLast7d  = coverageVisits.filter((v) => v.visitedAt.getTime() > now - 7 * 86400000).length;
    const visitsLast30d = coverageVisits.filter((v) => v.visitedAt.getTime() > now - 30 * 86400000).length;

    const coverageByBot: Record<string, { count: number; org: string }> = {};
    coverageVisits.forEach((v) => {
      if (!coverageByBot[v.botName]) coverageByBot[v.botName] = { count: 0, org: v.botOrg };
      coverageByBot[v.botName].count++;
    });

    // Per-article hit count, joined back with article metadata so the UI can
    // show "this brand_showcase post got 5 hits, this client_daily got 2".
    const coveragePerArticle = clientArticles.map((a) => {
      const hits = coverageVisits.filter((v) => v.url.includes(a.slug)).length;
      return {
        slug: a.slug,
        title: a.title,
        templateType: a.templateType,
        createdAt: a.createdAt,
        visits: hits,
      };
    }).sort((a, b) => b.visits - a.visits);

    // Bucket crawler visits into 13 weekly buckets so the UI can render
    // a simple bar chart without shipping raw 5000-row arrays.
    const weekBuckets: Array<{ weekStart: string; count: number }> = [];
    if (crawlerByWeek.length > 0) {
      const now = Date.now();
      for (let i = 12; i >= 0; i--) {
        const end = now - i * 7 * 86400000;
        const start = end - 7 * 86400000;
        const count = crawlerByWeek.filter((v) => {
          const t = v.visitedAt.getTime();
          return t >= start && t < end;
        }).length;
        weekBuckets.push({
          weekStart: new Date(start).toISOString().slice(0, 10),
          count,
        });
      }
    }

    return {
      site: {
        id: site.id,
        name: site.name,
        url: site.url,
        industry: site.industry,
        tier: site.tier,
        isClient: site.isClient,
        createdAt: site.createdAt,
      },
      overview: {
        currentScore: site.bestScore ?? 0,
        lastScannedAt: latestScan?.completedAt ?? site.bestScoreAt ?? null,
        tier: site.tier,
        industryRank,
        industryTotalSites: industryStats?._count.id ?? null,
        industryAvgScore: industryStats?._avg.bestScore
          ? Math.round(industryStats._avg.bestScore)
          : null,
      },
      freshness: {
        // Per-block "as-of" timestamps so the UI can show when each chunk
        // was last refreshed. Client expectations: scan blocks are weekly
        // (via @Cron scan-weekly-refresh), crawler is real-time, content
        // is daily (@Cron brand-showcase-daily), peers = same as scan.
        scanAsOf: latestScan?.completedAt ?? null,
        crawlerAsOf: crawlerRecent[0]?.visitedAt ?? null,
        contentAsOf:
          brandShowcase?.lastRegeneratedAt ?? brandShowcase?.createdAt ?? null,
        industryTop10AsOf: industryTop10Article?.createdAt ?? null,
      },
      scanTrend: scanTrend
        .map((s) => ({ score: s.totalScore, at: s.completedAt }))
        .reverse(), // oldest first for chart rendering
      indicators: latestScan
        ? latestScan.results.map((r) => ({
            indicator: r.indicator,
            score: r.score,
            status: r.status,
            suggestion: r.suggestion,
          }))
        : [],
      crawler: {
        totalVisits: crawlerTotalVisits,
        last90dVisits: crawlerByWeek.length,
        byBot: crawlerByBot
          .map((b) => ({
            botName: b.botName,
            botOrg: b.botOrg,
            count: (b._count as unknown as number) ?? 0,
          }))
          .sort((a, b) => b.count - a.count),
        byWeek: weekBuckets,
        recent: crawlerRecent.map((r) => ({
          botName: r.botName,
          botOrg: r.botOrg,
          url: r.url,
          visitedAt: r.visitedAt,
          statusCode: r.statusCode,
        })),
      },
      content: {
        knowledgeQaCount: qaCount,
        brandShowcase: brandShowcase
          ? {
              slug: brandShowcase.slug,
              title: brandShowcase.title,
              createdAt: brandShowcase.createdAt,
              lastRegeneratedAt: brandShowcase.lastRegeneratedAt,
            }
          : null,
        industryTop10: industryTop10Article
          ? {
              slug: industryTop10Article.slug,
              title: industryTop10Article.title,
              createdAt: industryTop10Article.createdAt,
              includedRank: industryRank, // same rank — useful for UI badge
            }
          : null,
      },
      peers: peerTop.map((p) => ({
        id: p.id,
        name: p.name,
        bestScore: p.bestScore,
        tier: p.tier,
        isMe: p.id === site.id,
      })),
      // Coverage = real AI-bot visits to articles Geovault published for
      // this client at /blog/<slug>. Distinct from crawler.* above which
      // tracks visits to the client's OWN site.
      geovaultCoverage: {
        articleCount: clientArticles.length,
        totalVisits: coverageVisits.length,
        last24h: visitsLast24h,
        last7d: visitsLast7d,
        last30d: visitsLast30d,
        byBot: Object.entries(coverageByBot)
          .map(([botName, v]) => ({ botName, botOrg: v.org, count: v.count }))
          .sort((a, b) => b.count - a.count),
        perArticle: coveragePerArticle,
        recent: coverageVisits.slice(0, 20).map((v) => ({
          botName: v.botName,
          botOrg: v.botOrg,
          url: v.url,
          visitedAt: v.visitedAt,
          statusCode: v.statusCode,
        })),
      },
    };
  }
}
