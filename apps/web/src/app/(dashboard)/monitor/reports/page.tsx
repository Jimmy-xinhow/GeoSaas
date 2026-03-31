'use client';

import { useState, useMemo } from 'react';
import { FileText, Play, Download, Loader2, CheckCircle2, XCircle, Clock, BarChart3, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSites } from '@/hooks/use-sites';
import { useClientQuerySets, useRunReport, useSiteReports, useReport } from '@/hooks/use-client-reports';

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

  // Group results by question for table
  const questionResults = useMemo(() => {
    const map = new Map<string, { question: string; category: string; platforms: Record<string, { mentioned: boolean; error: boolean }> }>();
    results.forEach((r: any) => {
      if (!map.has(r.question)) {
        map.set(r.question, { question: r.question, category: r.category, platforms: {} });
      }
      map.get(r.question)!.platforms[r.platform] = {
        mentioned: r.mentioned,
        error: r.response?.startsWith('[Error]') || false,
      };
    });
    return Array.from(map.values());
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

      {/* Live Question Results Table */}
      {questionResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">問題明細（即時更新）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="border-b border-white/10">
                    <th className="text-left p-2 font-medium text-gray-400 w-8">#</th>
                    <th className="text-left p-2 font-medium text-gray-400">問題</th>
                    {PLATFORMS.map((p) => (
                      <th key={p} className="text-center p-2 font-medium text-gray-400 w-20">{PLATFORM_LABELS[p]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questionResults.map((qr, i) => (
                    <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                      <td className="p-2 text-gray-400">{i + 1}</td>
                      <td className="p-2">
                        <span className="text-white">{qr.question}</span>
                        {qr.category && (
                          <span className="ml-2 text-xs text-gray-400">{qr.category.slice(0, 15)}</span>
                        )}
                      </td>
                      {PLATFORMS.map((p) => {
                        const pr = qr.platforms[p];
                        if (!pr) return <td key={p} className="text-center p-2"><span className="text-gray-300">—</span></td>;
                        if (pr.error) return <td key={p} className="text-center p-2"><span className="text-yellow-500">⚠</span></td>;
                        return (
                          <td key={p} className="text-center p-2">
                            {pr.mentioned ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
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

export default function ClientReportsPage() {
  const { data: sites } = useSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [activeReportId, setActiveReportId] = useState<string>('');
  const [activeQsLength, setActiveQsLength] = useState(0);
  const [siteSearch, setSiteSearch] = useState('');

  const { data: querySets, isLoading: qsLoading } = useClientQuerySets(selectedSiteId);
  const { data: reports } = useSiteReports(selectedSiteId);
  const runReport = useRunReport();

  const handleRunReport = async (querySetId: string, queryCount: number) => {
    try {
      const result = await runReport.mutateAsync(querySetId);
      setActiveReportId(result.reportId);
      setActiveQsLength(queryCount);
      toast.success('報告生成已啟動');
    } catch {
      toast.error('啟動失敗');
    }
  };

  const handleDownloadPdf = (reportId: string) => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/client-reports/report/${reportId}/html`, '_blank');
    toast.success('已開啟報告，使用 Ctrl+P 儲存為 PDF');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="h-6 w-6" />
          客戶驗收報告
        </h1>
        <p className="text-muted-foreground mt-1">
          一鍵查詢客戶問題集在 5 大 AI 平台的引用狀態，即時追蹤進度
        </p>
      </div>

      {/* Site Selector: Search + Dropdown */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium shrink-0">選擇客戶：</span>
            <Select value={selectedSiteId} onValueChange={(v) => { setSelectedSiteId(v); setActiveReportId(''); setSiteSearch(''); }}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="下拉選擇" />
              </SelectTrigger>
              <SelectContent>
                {(sites as any[])?.slice(0, 50).map((s: any) => (
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
        <>
          {/* Query Sets */}
          {qsLoading ? (
            <Skeleton className="h-32" />
          ) : querySets && querySets.length > 0 ? (
            querySets.map((qs) => (
              <Card key={qs.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{qs.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{qs.queries.length} 題 × 5 平台 = {qs.queries.length * 5} 次查詢</Badge>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleRunReport(qs.id, qs.queries.length)}
                        disabled={runReport.isPending}
                      >
                        {runReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                        一鍵查詢 5 平台
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
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                此網站尚未建立問題集
              </CardContent>
            </Card>
          )}

          {/* Active Report — Live Progress */}
          {activeReportId && (
            <LiveReport reportId={activeReportId} totalQuestions={activeQsLength} />
          )}

          {/* Report History */}
          {reports && reports.length > 0 && !activeReportId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  歷史報告
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10"
                      onClick={() => { setActiveReportId(r.id); setActiveQsLength((r.summary as any)?.totalQueries || 100); }}
                    >
                      <div className="flex items-center gap-3">
                        {r.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : r.status === 'running' ? (
                          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                        ) : (
                          <Clock className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="font-medium text-sm">{r.querySet?.name}</span>
                        <Badge variant="outline" className="text-xs">{r.period}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        {r.summary && (
                          <span className="text-sm font-bold text-blue-600">{(r.summary as any).mentionRate}%</span>
                        )}
                        {r.status === 'completed' && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownloadPdf(r.id); }}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
