import { Injectable, Logger, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorService } from '../monitor/monitor.service';
import pLimit from 'p-limit';

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
  ) {}

  /** On startup, recover orphaned "running" reports */
  async onModuleInit() {
    const orphaned = await this.prisma.monitorReport.findMany({
      where: { status: { in: ['running', 'failed'] } },
    });

    let recovered = 0;
    let marked = 0;
    for (const report of orphaned) {
      const results = (report.results as any[]) || [];
      if (results.length > 0) {
        // Has results — mark as completed and compute summary if missing
        const summary = report.summary || this.computeSummary(results);
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'completed', completedAt: report.completedAt || new Date(), summary: summary as any },
        });
        recovered++;
      } else if (report.status === 'running') {
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'failed' },
        });
        marked++;
      }
    }
    if (recovered > 0) this.logger.log(`Recovered ${recovered} report(s) with results from failed/running status`);
    if (marked > 0) this.logger.warn(`Marked ${marked} truly empty report(s) as failed`);
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
  async runReport(querySetId: string, role?: string): Promise<{ reportId: string; cached?: boolean }> {
    const querySet = await this.prisma.clientQuerySet.findUnique({
      where: { id: querySetId },
      include: { site: true },
    });

    if (!querySet) throw new NotFoundException('Query set not found');

    if (role) {
      await this.assertSiteAccess(querySet.siteId, role);
    }

    // Check for recent completed report (within 14 days)
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
      this.logger.log(`Report cache hit: ${recentReport.id} (${recentReport.createdAt.toISOString().slice(0, 10)})`);
      return { reportId: recentReport.id, cached: true };
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

    // Run in background — always mark completed when done, even if errors
    this.executeReport(report.id, querySet.site, querySet.queries as unknown as QueryItem[]).catch(async (err) => {
      this.logger.error(`Report ${report.id} error: ${err}`);
      // Check if results were actually saved despite the error
      const current = await this.prisma.monitorReport.findUnique({ where: { id: report.id } });
      const results = (current?.results as any[]) || [];
      if (results.length > 0) {
        // Results exist — mark as completed, not failed; compute summary
        const summary = current?.summary || this.computeSummary(results);
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'completed', completedAt: new Date(), summary: summary as any },
        });
        this.logger.log(`Report ${report.id} had errors but ${results.length} results saved — marked completed`);
      } else {
        await this.prisma.monitorReport.update({
          where: { id: report.id },
          data: { status: 'failed' },
        });
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
}
