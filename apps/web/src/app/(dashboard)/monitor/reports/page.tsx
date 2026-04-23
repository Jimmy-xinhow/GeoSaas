'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Play, Download, Loader2, CheckCircle2, XCircle, Clock, BarChart3, Timer, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useSites } from '@/hooks/use-sites';
import { useClientQuerySets, useRunReport, useSiteReports, useReport, useDeleteReport, useGeoComprehensive, useReportQuota } from '@/hooks/use-client-reports';

const PLATFORM_LABELS: Record<string, string> = {
  CHATGPT: 'ChatGPT', CLAUDE: 'Claude', PERPLEXITY: 'Perplexity', GEMINI: 'Gemini', COPILOT: 'Copilot',
};
const PLATFORMS = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];

function formatEta(seconds: number): string {
  if (seconds <= 0) return '即將完成';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

function LiveReport({ reportId, totalQuestions }: { reportId: string; totalQuestions: number }) {
  const { data: report } = useReport(reportId);

  const results = useMemo(() => (report?.results as any[]) || [], [report?.results]);
  const isRunning = report?.status === 'running';
  const isCompleted = report?.status === 'completed';

  // Calculate progress
  const totalCalls = totalQuestions * 5;
  const completedCalls = results.length;
  const progressPct = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const completedQuestions = Math.floor(completedCalls / 5);

  // ETA calculation: average ~5 seconds per call
  const remainingCalls = totalCalls - completedCalls;
  const etaSeconds = remainingCalls * 5;

  // Live stats
  const mentionedCount = results.filter((r: any) => r.mentioned).length;
  const errorCount = results.filter((r: any) => r.response?.startsWith('[Error]')).length;
  const validCount = completedCalls - errorCount;
  const mentionRate = validCount > 0 ? Math.round((mentionedCount / validCount) * 100) : 0;

  // Platform live stats
  const platformStats = useMemo(() => {
    return PLATFORMS.map((p) => {
      const pResults = results.filter((r: any) => r.platform === p && !r.response?.startsWith('[Error]'));
      const pMentioned = pResults.filter((r: any) => r.mentioned).length;
      return {
        platform: p,
        total: pResults.length,
        mentioned: pMentioned,
        rate: pResults.length > 0 ? Math.round((pMentioned / pResults.length) * 100) : 0,
      };
    });
  }, [results]);

  // Group results by question for table. Keep the full AI response + position
  // + error detail per platform so the expanded row can render them without
  // refetching. Previous version discarded everything except mentioned/error.
  const questionResults = useMemo(() => {
    type PlatformCell = {
      mentioned: boolean;
      error: boolean;
      errorMessage?: string;
      position?: number | null;
      response?: string;
    };
    const map = new Map<string, {
      question: string;
      category: string;
      platforms: Record<string, PlatformCell>;
    }>();
    results.forEach((r: any) => {
      if (!map.has(r.question)) {
        map.set(r.question, { question: r.question, category: r.category, platforms: {} });
      }
      const resp = typeof r.response === 'string' ? r.response : '';
      const isErr = resp.startsWith('[Error]');
      map.get(r.question)!.platforms[r.platform] = {
        mentioned: !!r.mentioned,
        error: isErr,
        errorMessage: isErr ? resp.slice(0, 200) : undefined,
        position: typeof r.position === 'number' ? r.position : null,
        response: isErr ? undefined : resp,
      };
    });
    return Array.from(map.values());
  }, [results]);

  // Category-level aggregation — user wanted "全面的細節"; grouping by
  // category tells them which QUESTION CLASSES land vs miss.
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; mentioned: number; errors: number }>();
    results.forEach((r: any) => {
      const cat = r.category || '(未分類)';
      if (!map.has(cat)) map.set(cat, { total: 0, mentioned: 0, errors: 0 });
      const entry = map.get(cat)!;
      if (typeof r.response === 'string' && r.response.startsWith('[Error]')) {
        entry.errors++;
        return;
      }
      entry.total++;
      if (r.mentioned) entry.mentioned++;
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        total: v.total,
        mentioned: v.mentioned,
        errors: v.errors,
        rate: v.total > 0 ? Math.round((v.mentioned / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [results]);

  // Error-reason breakdown — classify errors so the user can tell if it's
  // API outage, auth, rate limit, or actual detection failure.
  const errorStats = useMemo(() => {
    const buckets: Record<string, number> = {};
    results.forEach((r: any) => {
      const resp = typeof r.response === 'string' ? r.response : '';
      if (!resp.startsWith('[Error]')) return;
      // Try to bucket common patterns: [Error] 429 / timeout / 401 / other
      let bucket = 'other';
      if (/429|rate.?limit|quota/i.test(resp)) bucket = 'rate_limit';
      else if (/timeout|timed?.?out|ETIMEDOUT/i.test(resp)) bucket = 'timeout';
      else if (/401|403|unauthori[sz]ed|forbidden|api.?key/i.test(resp)) bucket = 'auth';
      else if (/5\d\d|server.?error|bad.?gateway/i.test(resp)) bucket = 'server_5xx';
      else if (/400|bad.?request/i.test(resp)) bucket = 'bad_request';
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    });
    return Object.entries(buckets)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  const handleDownloadPdf = () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/client-reports/report/${reportId}/html`;
    window.open(url, '_blank');
    toast.success('已開啟報告，使用 Ctrl+P 儲存為 PDF');
  };

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <Card className={isRunning ? 'border-blue-200' : isCompleted ? 'border-green-200' : ''}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {isRunning ? (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Clock className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <p className="font-semibold text-white">
                  {isRunning ? '報告生成中...' : isCompleted ? '報告完成' : '等待中'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {report?.period} · {completedQuestions}/{totalQuestions} 題 · {completedCalls}/{totalCalls} 次查詢
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="flex items-center gap-1.5 text-sm text-blue-600">
                  <Timer className="h-4 w-4" />
                  預估 {formatEta(etaSeconds)}
                </div>
              )}
              {isCompleted && (
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                  <Download className="h-4 w-4 mr-1" />
                  下載 PDF
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{progressPct}% 完成</span>
            <span>{completedCalls} / {totalCalls}</span>
          </div>
        </CardContent>
      </Card>

      {/* Live Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-3xl font-bold ${mentionRate >= 50 ? 'text-green-600' : mentionRate >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
              {mentionRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">即時引用率</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{mentionedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">已被引用</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-white">{validCount}</p>
            <p className="text-xs text-muted-foreground mt-1">已完成查詢</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-red-500">{errorCount}</p>
            <p className="text-xs text-muted-foreground mt-1">失敗</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-5 gap-2">
        {platformStats.map((s) => (
          <Card key={s.platform}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.rate >= 50 ? 'text-green-600' : s.rate >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                {s.rate}%
              </p>
              <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[s.platform]}</p>
              <p className="text-xs text-gray-400">{s.mentioned}/{s.total}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Breakdown — which question classes perform? */}
      {categoryStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">類別表現</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {categoryStats.map((c) => (
                <div key={c.name} className="p-3 rounded-md bg-white/5 border border-white/10">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400 truncate" title={c.name}>
                      {c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name}
                    </span>
                    <span className={`text-lg font-bold ${c.rate >= 50 ? 'text-green-500' : c.rate >= 20 ? 'text-yellow-500' : 'text-red-400'}`}>
                      {c.rate}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {c.mentioned}/{c.total}{c.errors > 0 && <span className="text-red-400 ml-2">⚠ {c.errors}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Breakdown — surfaces API failures so the user can tell detection
          misses from infrastructure issues */}
      {errorStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-400">失敗原因分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {errorStats.map((e) => (
                <div key={e.name} className="px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-sm">
                  <span className="text-red-300">{e.name}</span>
                  <span className="text-red-200 ml-2 font-semibold">{e.count}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              rate_limit=429 配額、timeout=逾時、auth=API 金鑰、server_5xx=伺服器錯誤、bad_request=請求格式問題
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live Question Results Table — with expandable rows showing the full
          AI response, ranking position, and error details for each platform */}
      {questionResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">問題明細（點擊展開查看 AI 回應）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900 z-10">
                  <tr className="border-b border-white/10">
                    <th className="text-left p-2 font-medium text-gray-400 w-8">#</th>
                    <th className="text-left p-2 font-medium text-gray-400">問題 / 類別</th>
                    {PLATFORMS.map((p) => (
                      <th key={p} className="text-center p-2 font-medium text-gray-400 w-20">{PLATFORM_LABELS[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questionResults.map((qr, i) => (
                    <ExpandableRow key={i} index={i} qr={qr} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * One row per question. Clicking the row expands an inline detail panel
 * with the full AI response, ranked position, and error messages for each
 * of the 5 platforms — the context the flat check/cross view previously
 * discarded.
 */
function ExpandableRow({
  index,
  qr,
}: {
  index: number;
  qr: {
    question: string;
    category: string;
    platforms: Record<string, {
      mentioned: boolean;
      error: boolean;
      errorMessage?: string;
      position?: number | null;
      response?: string;
    }>;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAnyDetail = PLATFORMS.some((p) => {
    const c = qr.platforms[p];
    return !!(c && (c.response || c.errorMessage));
  });

  return (
    <>
      <tr
        className={`border-b border-white/10 hover:bg-white/5 ${hasAnyDetail ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => hasAnyDetail && setExpanded((v) => !v)}
      >
        <td className="p-2 text-gray-400">{index + 1}</td>
        <td className="p-2">
          <div className="flex items-center gap-2">
            {hasAnyDetail && (
              <span className="text-gray-500 text-xs">{expanded ? '▼' : '▶'}</span>
            )}
            <span className="text-white">{qr.question}</span>
          </div>
          {qr.category && (
            <span className="text-xs text-gray-400 mt-0.5 block">{qr.category}</span>
          )}
        </td>
        {PLATFORMS.map((p) => {
          const pr = qr.platforms[p];
          if (!pr) return <td key={p} className="text-center p-2"><span className="text-gray-300">—</span></td>;
          if (pr.error) return <td key={p} className="text-center p-2"><span className="text-yellow-500" title={pr.errorMessage}>⚠</span></td>;
          return (
            <td key={p} className="text-center p-2">
              {pr.mentioned ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {typeof pr.position === 'number' && pr.position > 0 && (
                    <span className="text-xs text-green-400 mt-0.5">#{pr.position}</span>
                  )}
                </div>
              ) : (
                <XCircle className="h-4 w-4 text-red-400 mx-auto" />
              )}
            </td>
          );
        })}
      </tr>
      {expanded && (
        <tr className="bg-white/[0.02]">
          <td />
          <td colSpan={6} className="p-3">
            <div className="space-y-3">
              {PLATFORMS.map((p) => {
                const pr = qr.platforms[p];
                if (!pr) return null;
                return (
                  <div key={p} className="border-l-2 border-white/10 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-300">{PLATFORM_LABELS[p]}</span>
                      {pr.error ? (
                        <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">錯誤</Badge>
                      ) : pr.mentioned ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/30">
                          已引用{typeof pr.position === 'number' && pr.position > 0 ? ` · 位置 #${pr.position}` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-400 border-red-400/30">未引用</Badge>
                      )}
                    </div>
                    {pr.errorMessage && (
                      <p className="text-xs text-yellow-400/80 whitespace-pre-wrap break-words">
                        {pr.errorMessage}
                      </p>
                    )}
                    {pr.response && (
                      <p className="text-xs text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                        {pr.response.length > 800 ? pr.response.slice(0, 800) + '…' : pr.response}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ReportHistory({ reports, selectedSiteName, onView, onDownload }: {
  reports: any[];
  selectedSiteName: string;
  onView: (r: any) => void;
  onDownload: (id: string) => void;
}) {
  const deleteMutation = useDeleteReport();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          歷史報告
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {reports.map((r) => {
            const results = r.results || [];
            const totalResults = results.length;
            const mentionRate = (r.summary as any)?.mentionRate;
            const createdDate = new Date(r.createdAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
            const title = `${selectedSiteName} — ${r.querySet?.name || '驗收報告'} — ${createdDate}`;
            const isDeleting = deleteConfirm === r.id;

            return (
              <div
                key={r.id}
                className={`flex items-center justify-between p-3 rounded-lg ${isDeleting ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 hover:bg-white/10'}`}
              >
                <div
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  onClick={() => !isDeleting && onView(r)}
                >
                  {r.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : r.status === 'running' ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{r.period}</Badge>
                      <span className="text-[10px] text-gray-500">{totalResults} 筆查詢</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {mentionRate !== undefined && (
                    <span className={`text-sm font-bold ${mentionRate >= 20 ? 'text-green-400' : mentionRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {mentionRate}%
                    </span>
                  )}
                  {r.status === 'completed' && (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDownload(r.id); }} title="下載 PDF">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isDeleting ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { deleteMutation.mutate(r.id); setDeleteConfirm(null); toast.success('報告已刪除'); }}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-300"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r.id); }} title="刪除">
                      <Trash2 className="h-3.5 w-3.5 text-gray-600 hover:text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientReportsPage() {
  const { data: sites } = useSites();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read siteId from URL on mount, persist selection to URL
  const selectedSiteId = searchParams.get('siteId') || '';
  const setSelectedSiteId = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('siteId', id);
    } else {
      params.delete('siteId');
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const [activeReportId, setActiveReportId] = useState<string>('');
  const [activeQsLength, setActiveQsLength] = useState(0);
  const [siteSearch, setSiteSearch] = useState('');

  const { data: querySets, isLoading: qsLoading } = useClientQuerySets(selectedSiteId);
  const { data: reports } = useSiteReports(selectedSiteId);
  const { data: quota } = useReportQuota(selectedSiteId);
  const runReport = useRunReport();

  const handleRunReport = async (querySetId: string, queryCount: number) => {
    try {
      const result = await runReport.mutateAsync(querySetId);
      setActiveReportId(result.reportId);
      setActiveQsLength(queryCount);
      toast.success(result.cached ? '已載入最近 14 天內的報告(不計配額)' : '報告生成已啟動');
    } catch (err: any) {
      // Surface the server's reason (quota exhausted / 4h cooldown) so the
      // user can tell WHY the button doesn't work — otherwise it just looks
      // broken.
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        '啟動失敗';
      toast.error(msg);
    }
  };

  const handleDownloadPdf = (reportId: string) => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/client-reports/report/${reportId}/html`, '_blank');
    toast.success('已開啟報告，使用 Ctrl+P 儲存為 PDF');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="h-6 w-6" />
            驗收報告
          </h1>
          <p className="text-muted-foreground mt-1">
            一鍵查詢問題集在 5 大 AI 平台的引用狀態，即時追蹤進度
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['client-reports'] });
            toast.success('已刷新');
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          刷新
        </Button>
      </div>

      {/* Site Selector: Search + Dropdown */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium shrink-0">選擇客戶：</span>
            <Select value={selectedSiteId} onValueChange={(v) => { setSelectedSiteId(v); setActiveReportId(''); setSiteSearch(''); }}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder={`下拉選擇 (共 ${(sites as any[])?.length ?? 0} 個)`} />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {/* Previously .slice(0, 50) — the hidden limit silently dropped clients
                    when the directory grew past 50 sites. Render all, sorted by name,
                    and rely on the search box for long lists. */}
                {[...((sites as any[]) ?? [])]
                  .sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? '', 'zh-Hant'))
                  .map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">或</span>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="搜尋客戶名稱或網址..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="w-full h-10 px-3 border border-white/10 bg-white/5 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {siteSearch && (
            <div className="max-h-[200px] overflow-y-auto border border-white/10 rounded-md divide-y divide-white/5">
              {(sites as any[])
                ?.filter((s: any) => {
                  const q = siteSearch.toLowerCase();
                  return s.name?.toLowerCase().includes(q) || s.url?.toLowerCase().includes(q);
                })
                .slice(0, 20)
                .map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSiteId(s.id); setSiteSearch(''); setActiveReportId(''); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">{s.url}</p>
                  </button>
                ))}
              {(sites as any[])?.filter((s: any) => {
                const q = siteSearch.toLowerCase();
                return s.name?.toLowerCase().includes(q) || s.url?.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground text-center">無符合結果</p>
              )}
            </div>
          )}
          {selectedSiteId && !siteSearch && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">已選：</span>
              <Badge variant="secondary" className="text-sm">
                {(sites as any[])?.find((s: any) => s.id === selectedSiteId)?.name}
              </Badge>
              <button onClick={() => { setSelectedSiteId(''); setActiveReportId(''); }} className="text-xs text-gray-400 hover:text-red-500">
                ✕ 清除
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSiteId && (
        <Tabs defaultValue="citation" className="w-full">
          <TabsList>
            <TabsTrigger value="citation">📝 AI 引用驗收</TabsTrigger>
            <TabsTrigger value="geo">📊 GEO 綜合體檢</TabsTrigger>
          </TabsList>

          {/* Tab 1: 既有的問題集驗收 */}
          <TabsContent value="citation" className="space-y-4 mt-4">
            {/* Quota banner — shows monthly used / limit. Hidden for staff/admin
                who bypass quota anyway (bypassesQuota=true from API). */}
            {quota && !quota.bypassesQuota && (
              <div className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
                quota.monthly.remaining === 0
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : quota.monthly.remaining === 1
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
              }`}>
                <span>
                  <strong>{quota.plan}</strong> 方案 · 本月驗收報告配額:
                  <span className="font-bold ml-1">{quota.monthly.used}/{quota.monthly.limit}</span>
                  <span className="ml-2">（剩餘 {quota.monthly.remaining} 次）</span>
                </span>
                {quota.monthly.remaining === 0 && (
                  <span className="text-xs">下月 1 日重置</span>
                )}
              </div>
            )}

            {qsLoading ? (
              <Skeleton className="h-32" />
            ) : querySets && querySets.length > 0 ? (
              querySets.map((qs) => {
                const qsQuota = quota?.cooldowns.find((c) => c.querySetId === qs.id);
                const onCooldown = qsQuota && !qsQuota.canRun;
                const outOfQuota = quota && !quota.bypassesQuota && quota.monthly.remaining === 0;
                const disabled = runReport.isPending || !!onCooldown || !!outOfQuota;
                const cooldownLabel = onCooldown && qsQuota?.cooldownUntil
                  ? (() => {
                      const remaining = new Date(qsQuota.cooldownUntil).getTime() - Date.now();
                      const mins = Math.max(0, Math.ceil(remaining / 60000));
                      const hrs = Math.floor(mins / 60);
                      const m = mins % 60;
                      return hrs > 0 ? `${hrs}h ${m}m 後可再跑` : `${m} 分鐘後可再跑`;
                    })()
                  : null;

                return (
                  <Card key={qs.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{qs.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{qs.queries.length} 題 × 5 平台 = {qs.queries.length * 5} 次查詢</Badge>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                            onClick={() => handleRunReport(qs.id, qs.queries.length)}
                            disabled={disabled}
                            title={outOfQuota ? '本月配額用罄' : cooldownLabel ?? ''}
                          >
                            {runReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                            {outOfQuota ? '配額用罄' : cooldownLabel ?? '一鍵查詢 5 平台'}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[150px] overflow-y-auto space-y-1 text-sm">
                        {qs.queries.slice(0, 8).map((q, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-gray-400 w-6 text-right shrink-0">{i + 1}.</span>
                            <span className="text-gray-300 truncate">{q.question}</span>
                          </div>
                        ))}
                        {qs.queries.length > 8 && (
                          <p className="text-xs text-muted-foreground ml-8">... 還有 {qs.queries.length - 8} 題</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  此網站尚未建立問題集
                </CardContent>
              </Card>
            )}

            {activeReportId && (
              <LiveReport reportId={activeReportId} totalQuestions={activeQsLength} />
            )}

            {reports && reports.length > 0 && !activeReportId && (
              <ReportHistory
                reports={reports}
                selectedSiteName={(sites as any[])?.find((s: any) => s.id === selectedSiteId)?.name || ''}
                onView={(r) => { setActiveReportId(r.id); setActiveQsLength((r.summary as any)?.totalQueries || 100); }}
                onDownload={handleDownloadPdf}
              />
            )}
          </TabsContent>

          {/* Tab 2: GEO 綜合體檢 */}
          <TabsContent value="geo" className="mt-4">
            <GeoComprehensivePanel siteId={selectedSiteId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * GEO 綜合體檢面板 — 取自 client-reports/geo-comprehensive/:siteId
 * 分 5 個區塊:總覽 / GEO 分數趨勢 / 9 指標 / AI 爬蟲 / 內容資產 + 競品
 */
/**
 * Turn an ISO timestamp into a human-readable "how long ago" + absolute date
 * label. Used to flag which blocks of the report might be stale.
 *   <1 day  → "今天"     green
 *    <7 day → "X 天前"   blue / green
 *   <30 day → "X 天前"   yellow (borderline)
 *   ≥30 day → "X 天前"   red   (stale)
 *   null    → "尚無資料"  gray
 */
function FreshnessLabel({ asOf, expected }: { asOf: string | null; expected: string }) {
  if (!asOf) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded border border-gray-500/30 text-gray-400">
        尚無資料 · 預期 {expected}
      </span>
    );
  }
  const ts = new Date(asOf);
  const days = Math.floor((Date.now() - ts.getTime()) / 86400000);
  const dateStr = ts.toLocaleDateString('zh-TW');

  let color = 'border-green-500/30 text-green-400';
  let label = '今天';
  if (days >= 30) {
    color = 'border-red-500/30 text-red-400';
    label = `${days} 天前`;
  } else if (days >= 14) {
    color = 'border-yellow-500/30 text-yellow-400';
    label = `${days} 天前`;
  } else if (days >= 1) {
    color = 'border-blue-500/30 text-blue-300';
    label = `${days} 天前`;
  }
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded border ${color}`}
      title={`資料日期: ${dateStr} · 預期更新頻率: ${expected}`}
    >
      {label} · {dateStr}
    </span>
  );
}

function GeoComprehensivePanel({ siteId }: { siteId: string }) {
  const { data, isLoading } = useGeoComprehensive(siteId);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return <Card><CardContent className="p-8 text-center text-muted-foreground">無資料</CardContent></Card>;

  const { overview, scanTrend, indicators, crawler, content, peers, site, freshness } = data;
  const maxTrend = Math.max(100, ...scanTrend.map((s) => s.score));
  const maxBucket = Math.max(1, ...crawler.byWeek.map((w) => w.count));

  return (
    <div className="space-y-4">
      {/* Block 1: Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-3xl font-bold ${
              overview.currentScore >= 80 ? 'text-green-500'
              : overview.currentScore >= 60 ? 'text-blue-500'
              : overview.currentScore >= 40 ? 'text-yellow-500' : 'text-red-400'
            }`}>{overview.currentScore}</p>
            <p className="text-xs text-muted-foreground mt-1">目前 GEO 分數</p>
            {overview.tier && <p className="text-xs text-gray-500 mt-0.5">{overview.tier}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-white">
              {overview.industryRank ?? '—'}
              {overview.industryTotalSites && (
                <span className="text-lg text-gray-400">/{overview.industryTotalSites}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">產業排名</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-white">
              {overview.industryAvgScore ?? '—'}
              <span className="text-lg text-gray-400 ml-1">/100</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">產業平均</p>
            {overview.industryAvgScore !== null && (
              <p className={`text-xs mt-0.5 ${
                overview.currentScore >= overview.industryAvgScore ? 'text-green-400' : 'text-red-400'
              }`}>
                {overview.currentScore >= overview.industryAvgScore ? '▲' : '▼'}{' '}
                {Math.abs(overview.currentScore - overview.industryAvgScore)} 分
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-500">{crawler.totalVisits}</p>
            <p className="text-xs text-muted-foreground mt-1">AI 爬蟲總造訪</p>
            <p className="text-xs text-gray-500 mt-0.5">近 90 天 {crawler.last90dVisits}</p>
          </CardContent>
        </Card>
      </div>

      {/* Block 2: Scan Trend sparkline */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">GEO 分數趨勢（最近 10 次掃描）</CardTitle>
            <FreshnessLabel asOf={freshness.scanAsOf} expected="每週" />
          </div>
        </CardHeader>
        <CardContent>
          {scanTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無掃描記錄</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {scanTrend.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${new Date(s.at).toLocaleDateString('zh-TW')} · ${s.score}`}>
                  <div
                    className={`w-full rounded-t ${s.score >= 80 ? 'bg-green-500' : s.score >= 60 ? 'bg-blue-500' : s.score >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                    style={{ height: `${(s.score / maxTrend) * 100}%` }}
                  />
                  <span className="text-[10px] text-gray-500">{s.score}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block 3: 9 indicators */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">9 項 GEO 指標（最新掃描）</CardTitle>
            <FreshnessLabel asOf={freshness.scanAsOf} expected="每週" />
          </div>
        </CardHeader>
        <CardContent>
          {indicators.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無掃描結果</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {indicators.map((ind) => (
                <div key={ind.indicator} className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 min-w-0">
                    {ind.status === 'pass'
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : ind.status === 'warning'
                      ? <span className="text-yellow-500 text-sm shrink-0">⚠</span>
                      : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                    <span className="text-sm text-white truncate">{ind.indicator}</span>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ml-2 ${
                    ind.score >= 80 ? 'text-green-400'
                    : ind.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{ind.score}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block 4: AI Crawler activity */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI 爬蟲活動（近 90 天）</CardTitle>
            <FreshnessLabel asOf={freshness.crawlerAsOf} expected="即時" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {crawler.byBot.length === 0 ? (
            <p className="text-sm text-muted-foreground">近期沒有真實 AI 爬蟲造訪記錄</p>
          ) : (
            <>
              <div>
                <p className="text-xs text-gray-400 mb-2">各 Bot 訪問次數</p>
                <div className="flex flex-wrap gap-2">
                  {crawler.byBot.map((b) => (
                    <div key={b.botName} className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-sm">
                      <span className="text-gray-300">{b.botName}</span>
                      <span className="text-xs text-gray-500 ml-1">({b.botOrg})</span>
                      <span className="text-blue-400 font-semibold ml-2">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">週訪問量(最近 13 週)</p>
                <div className="flex items-end gap-1 h-16">
                  {crawler.byWeek.map((w, i) => (
                    <div key={i} className="flex-1 bg-blue-500/60 rounded-t" title={`${w.weekStart}: ${w.count} 次`} style={{ height: `${(w.count / maxBucket) * 100}%`, minHeight: w.count > 0 ? '2px' : '0' }} />
                  ))}
                </div>
              </div>
              {crawler.recent.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">最近 20 次訪問</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {crawler.recent.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-white/5">
                        <span className="text-gray-300 w-28 shrink-0">{r.botName}</span>
                        <span className="text-gray-500 flex-1 truncate">{r.url}</span>
                        <span className="text-gray-500 shrink-0">{new Date(r.visitedAt).toLocaleDateString('zh-TW')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Block 5: Content Assets */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">內容資產盤點</CardTitle>
            <FreshnessLabel asOf={freshness.contentAsOf} expected="每日 cron" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="p-3 rounded bg-white/5 border border-white/10">
              <p className="text-gray-400 text-xs">知識庫 Q&A</p>
              <p className="text-xl font-bold text-white mt-1">{content.knowledgeQaCount}</p>
            </div>
            <div className="p-3 rounded bg-white/5 border border-white/10">
              <p className="text-gray-400 text-xs">品牌深度介紹</p>
              {content.brandShowcase ? (
                <a href={`/blog/${content.brandShowcase.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm block mt-1 truncate">
                  ✅ 已生成 →
                </a>
              ) : (
                <p className="text-yellow-400 text-sm mt-1">⏳ 待生成</p>
              )}
            </div>
            <div className="p-3 rounded bg-white/5 border border-white/10">
              <p className="text-gray-400 text-xs">產業 Top 10 榜單</p>
              {content.industryTop10 ? (
                <a href={`/blog/${content.industryTop10.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm block mt-1 truncate">
                  ✅ 有榜單{content.industryTop10.includedRank && overview.industryRank && overview.industryRank <= 10 ? `(本站入榜 #${content.industryTop10.includedRank})` : ''}
                </a>
              ) : (
                <p className="text-gray-500 text-sm mt-1">— 尚無</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block 6: Industry Peers */}
      {peers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">同業標竿(Top 5)</CardTitle>
              <FreshnessLabel asOf={freshness.scanAsOf} expected="每週" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {peers.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between p-2 rounded ${p.isMe ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-white/5'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 w-6 text-right shrink-0">#{i + 1}</span>
                    <span className={`text-sm truncate ${p.isMe ? 'font-bold text-blue-300' : 'text-white'}`}>
                      {p.name}{p.isMe && ' (本站)'}
                    </span>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ml-2 ${
                    p.bestScore >= 80 ? 'text-green-400'
                    : p.bestScore >= 60 ? 'text-blue-400' : 'text-yellow-400'
                  }`}>{p.bestScore}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
