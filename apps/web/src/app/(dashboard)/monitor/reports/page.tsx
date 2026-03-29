'use client';

import { useState } from 'react';
import { FileText, Play, Download, Loader2, CheckCircle2, Clock, BarChart3 } from 'lucide-react';
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

export default function ClientReportsPage() {
  const { data: sites } = useSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [activeReportId, setActiveReportId] = useState<string>('');

  const { data: querySets, isLoading: qsLoading } = useClientQuerySets(selectedSiteId);
  const { data: reports } = useSiteReports(selectedSiteId);
  const { data: activeReport } = useReport(activeReportId);
  const runReport = useRunReport();

  // Filter sites that have query sets
  const clientSites = (sites as any[])?.filter((s: any) =>
    s.name?.includes('立如') || s.name?.includes('詹大'),
  ) || [];

  const handleRunReport = async (querySetId: string) => {
    try {
      const result = await runReport.mutateAsync(querySetId);
      setActiveReportId(result.reportId);
      toast.success('報告生成已啟動，請等待完成');
    } catch {
      toast.error('啟動失敗');
    }
  };

  const handleDownloadPdf = (reportId: string) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/client-reports/report/${reportId}/html`;
    const win = window.open(url, '_blank');
    if (win) {
      // User can use browser's Print → Save as PDF
      toast.success('已在新視窗開啟報告，使用 Ctrl+P 儲存為 PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-6 w-6" />
          客戶驗收報告
        </h1>
        <p className="text-muted-foreground mt-1">
          一鍵查詢客戶問題集在 5 大 AI 平台的引用狀態，生成月度報告
        </p>
      </div>

      {/* Site Selector */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">選擇客戶：</span>
            <Select value={selectedSiteId} onValueChange={(v) => { setSelectedSiteId(v); setActiveReportId(''); }}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="選擇客戶網站" />
              </SelectTrigger>
              <SelectContent>
                {clientSites.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {s.url}</SelectItem>
                ))}
                {/* Also show all sites that have query sets */}
                {(sites as any[])?.filter((s: any) => !clientSites.find((c: any) => c.id === s.id)).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                      <Badge variant="secondary">{qs.queries.length} 題</Badge>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleRunReport(qs.id)}
                        disabled={runReport.isPending}
                      >
                        {runReport.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        一鍵查詢 5 平台
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {qs.queries.slice(0, 10).map((q, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 w-6 text-right">{i + 1}.</span>
                        <span className="text-gray-700">{q.question}</span>
                      </div>
                    ))}
                    {qs.queries.length > 10 && (
                      <p className="text-xs text-muted-foreground ml-8">... 還有 {qs.queries.length - 10} 題</p>
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

          {/* Active Report Progress */}
          {activeReport && activeReport.status === 'running' && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-5 flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <div>
                  <p className="font-medium text-blue-900">報告生成中...</p>
                  <p className="text-sm text-blue-700">正在向 5 個 AI 平台查詢 {activeReport.results?.length || 0} 個問題，請稍候</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completed Report */}
          {activeReport && activeReport.status === 'completed' && activeReport.summary && (
            <Card className="border-green-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    報告完成 — {activeReport.period}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(activeReport.id)}>
                    <Download className="h-4 w-4 mr-1" />
                    下載 PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{activeReport.summary.mentionRate}%</p>
                    <p className="text-xs text-muted-foreground">總引用率</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold">{activeReport.summary.mentionedCount}</p>
                    <p className="text-xs text-muted-foreground">被引用次數</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold">{activeReport.summary.totalChecks}</p>
                    <p className="text-xs text-muted-foreground">總查詢次數</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold">{activeReport.summary.totalQueries}</p>
                    <p className="text-xs text-muted-foreground">問題數</p>
                  </div>
                </div>

                {/* Platform breakdown */}
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(activeReport.summary.byPlatform).map(([platform, stats]: [string, any]) => (
                    <div key={platform} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className={`text-2xl font-bold ${stats.rate >= 50 ? 'text-green-600' : stats.rate >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {stats.rate}%
                      </p>
                      <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[platform] || platform}</p>
                      <p className="text-xs text-gray-400">{stats.mentioned}/{stats.total}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Report History */}
          {reports && reports.length > 0 && (
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
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                      onClick={() => setActiveReportId(r.id)}
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
