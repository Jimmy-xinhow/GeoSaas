'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, ExternalLink, Calendar, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { useQueryClient } from '@tanstack/react-query';
import { useSites } from '@/hooks/use-sites';
import {
  useClientDailyStats,
  useClientDailyList,
  useSetClientDailyPublication,
  type ClientDailyDayType,
} from '@/hooks/use-client-reports';

const DAY_LABELS: Record<ClientDailyDayType, { label: string; color: string }> = {
  mon_topical:     { label: '週一 · 話題解析', color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
  tue_qa_deepdive: { label: '週二 · Q&A 深度', color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  wed_service:     { label: '週三 · 服務剖析', color: 'text-purple-300 border-purple-500/30 bg-purple-500/10' },
  thu_audience:    { label: '週四 · 受眾指引', color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  fri_comparison:  { label: '週五 · 對比差異', color: 'text-pink-300 border-pink-500/30 bg-pink-500/10' },
  sat_data_pulse:  { label: '週六 · 數據脈動', color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
};

const PAGE_SIZE = 30;

function getErrorMessage(err: unknown): string {
  const data = (err as any)?.response?.data;
  const message = data?.message;
  if (typeof message === 'string') return message;
  if (message?.blockers?.length) {
    return `仍有阻擋原因：${message.blockers.join('、')}`;
  }
  if (data?.blockers?.length) {
    return `仍有阻擋原因：${data.blockers.join('、')}`;
  }
  return '公開失敗，請稍後再試';
}

export default function PublishedContentPage() {
  const queryClient = useQueryClient();
  const { data: sites } = useSites();
  const publicationMutation = useSetClientDailyPublication();
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [page, setPage] = useState(1);

  // Auto-pick first isClient site as default — most paid users only have one.
  const sortedSites = useMemo(() => {
    return [...((sites as any[]) ?? [])].sort((a, b) => {
      // isClient first, then alpha
      if (a.isClient !== b.isClient) return a.isClient ? -1 : 1;
      return (a.name ?? '').localeCompare(b.name ?? '', 'zh-Hant');
    });
  }, [sites]);

  useEffect(() => {
    if (selectedSiteId !== '' || sortedSites.length === 0) return;
    const firstClient = sortedSites.find((s) => s.isClient) ?? sortedSites[0];
    if (firstClient) {
      setSelectedSiteId(firstClient.id);
    }
  }, [selectedSiteId, sortedSites]);

  const { data: stats, isLoading: statsLoading } = useClientDailyStats(selectedSiteId);
  const { data: list, isLoading: listLoading, isFetching } = useClientDailyList(selectedSiteId, page, PAGE_SIZE);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const showingFrom = list && list.total > 0 ? (list.page - 1) * list.limit + 1 : 0;
  const showingTo = list ? Math.min(list.page * list.limit, list.total) : 0;

  const selectedSite = sortedSites.find((s) => s.id === selectedSiteId);
  const weeklyQuota = stats?.activeDaysPerWeek ?? 0;
  const isFreeOrUnentitled = stats && stats.activeDaysPerWeek === 0 && stats.totalCount === 0;
  const nonPublicCount = (stats?.unpublishedCount ?? 0) + (stats?.hiddenUnsafeCount ?? 0);

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      <PageHeader
        icon={FileText}
        title="Geovault 為您發布的內容"
        description="您訂閱方案內含的每日 AI 可引用內容,Geovault 自動為您撰寫並發布在 geovault.app/blog/...,專為 ChatGPT、Claude、Perplexity 等 AI 引用而設計。所有發布記錄完整透明列出。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['client-reports', 'client-daily-list'] });
              queryClient.invalidateQueries({ queryKey: ['client-reports', 'client-daily-stats'] });
              toast.success('已刷新');
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        }
      />

      {/* Site selector */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium shrink-0">選擇網站:</span>
            <Select
              value={selectedSiteId}
              onValueChange={(v) => { setSelectedSiteId(v); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue placeholder="選擇要查看的網站" />
              </SelectTrigger>
              <SelectContent className="max-h-[400px] bg-gray-900 border-white/10">
                {sortedSites.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="focus:bg-white/10">
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.isClient && (
                        <Badge variant="outline" className="text-[10px] text-green-300 border-green-500/30">
                          付費客戶
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedSiteId ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">請先選擇網站</CardContent>
        </Card>
      ) : (
        <>
          {/* Stats summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="overflow-hidden">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-400">
                  {statsLoading ? '—' : stats?.monthCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">本月已發布</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-300">
                  {statsLoading ? '—' : stats?.weekCount ?? 0}
                  {weeklyQuota > 0 && <span className="text-base text-gray-400 ml-1">/{weeklyQuota}</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">本週進度</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-white">
                  {statsLoading ? '—' : stats?.totalCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">歷史總數</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-200">
                  {statsLoading ? '—' : stats?.plan ?? 'FREE'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {weeklyQuota > 0 ? `每週 ${weeklyQuota} 篇配額` : '此方案不含每日內容'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Empty / FREE state */}
          {isFreeOrUnentitled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">尚未啟用每日 AI 可引用內容</CardTitle>
                <CardDescription>
                  此功能為 Starter 方案以上的訂閱權益。Geovault 會每週自動為您撰寫並發布
                  AI 友善的長尾內容,持續累積品牌在 ChatGPT / Claude / Perplexity 的能見度。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href="/settings"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:underline"
                >
                  前往升級方案 →
                </a>
              </CardContent>
            </Card>
          )}

          {nonPublicCount > 0 && (
            <Card className="border-amber-400/30 bg-amber-500/10">
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-medium text-amber-100">
                    有 {nonPublicCount} 篇後台內容紀錄目前未公開
                  </p>
                  <p className="text-xs text-amber-100/70">
                    {stats?.unpublishedCount ? `${stats.unpublishedCount} 篇為未公開狀態。` : ''}
                    {stats?.hiddenUnsafeCount ? `${stats.hiddenUnsafeCount} 篇因品質閘門未顯示於 public blog。` : ''}
                    列表會保留後台紀錄，避免誤判成完全沒有生成。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Article list */}
          {!isFreeOrUnentitled && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">
                    已發布文章
                    {list && list.total > 0 && (
                      <span className="text-sm text-gray-400 font-normal ml-2">
                        共 {list.total} 篇,顯示 {showingFrom}–{showingTo}
                      </span>
                    )}
                  </CardTitle>
                  {selectedSite && (
                    <Badge variant="outline" className="text-xs text-gray-300 border-white/10">
                      {selectedSite.name}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {listLoading && !list ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : !list || list.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    尚無發布記錄。下次自動發布時間:每天 UTC 08:00(台灣時間 16:00)
                  </p>
                ) : (
                  <>
                    <div className={`space-y-2 ${isFetching ? 'opacity-60' : ''}`}>
                      {list.items.map((article) => {
                        const dayMeta = article.dayType ? DAY_LABELS[article.dayType] : null;
                        const publicVisible = article.publicVisible !== false;
                        const isUnpublished = article.published === false;
                        const blockers = article.safetyReasons ?? [];
                        const hardBlockers = article.hardBlockers ?? [];
                        const canPublish = !publicVisible && (
                          article.canPublish ?? (isUnpublished && blockers.length === 0)
                        );
                        const needsRepair = canPublish && (
                          article.publicationAction === 'repair_and_publish' || blockers.length > 0
                        );
                        const isManualRequired = !publicVisible && !canPublish && (
                          article.publicationAction === 'manual_required' || hardBlockers.length > 0
                        );
                        const isPublishing = publicationMutation.isPending
                          && publicationMutation.variables?.slug === article.slug;
                        const date = new Date(article.createdAt);
                        const dateStr = date.toLocaleDateString('zh-TW', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                        });
                        const timeStr = date.toLocaleTimeString('zh-TW', {
                          hour: '2-digit', minute: '2-digit',
                        });
                        const inner = (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                                {article.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {dayMeta && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${dayMeta.color}`}>
                                    {dayMeta.label}
                                  </span>
                                )}
                                {isUnpublished ? (
                                  <span className="inline-flex items-center gap-1 rounded border border-gray-400/30 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">
                                    未公開
                                  </span>
                                ) : !publicVisible ? (
                                  <span className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                                    <AlertTriangle className="h-3 w-3" />
                                    品質閘門隱藏
                                  </span>
                                ) : null}
                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {dateStr} {timeStr}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {article.charLength} 字
                                </span>
                              </div>
                              {!publicVisible && blockers.length > 0 ? (
                                <p className="mt-1 text-[10px] text-amber-100/70">
                                  原因：{blockers.join('、')}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {canPublish && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 min-w-[104px] border-emerald-400/30 px-2 text-xs text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                                  disabled={isPublishing}
                                  onClick={() => {
                                    publicationMutation.mutate(
                                      { slug: article.slug, published: true },
                                      {
                                        onSuccess: (data: any) => toast.success(
                                          data?.repaired ? '已修復並公開文章' : '已公開文章',
                                        ),
                                        onError: (err) => toast.error(getErrorMessage(err)),
                                      },
                                    );
                                  }}
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  {isPublishing ? (needsRepair ? '修復中' : '公開中') : (needsRepair ? '修復並公開' : '審查後公開')}
                                </Button>
                              )}
                              {isManualRequired && (
                                <Link href={`/published-content/${article.slug}`}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 min-w-[96px] border-amber-400/40 px-2 text-xs text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                                  >
                                    人工處理
                                  </Button>
                                </Link>
                              )}
                              {!publicVisible && !isManualRequired && !canPublish && (
                                <Link href={`/published-content/${article.slug}`}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 min-w-[96px] border-amber-400/40 px-2 text-xs text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                                  >
                                    查看草稿
                                  </Button>
                                </Link>
                              )}
                              {publicVisible ? (
                                <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-blue-400 mt-0.5" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5" />
                              )}
                            </div>
                          </div>
                        );
                        return publicVisible ? (
                          <a
                            key={article.slug}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-colors group"
                          >
                            {inner}
                          </a>
                        ) : (
                          <div
                            key={article.slug}
                            className="block rounded-lg border border-amber-400/20 bg-amber-500/10 p-3"
                          >
                            {inner}
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 pt-4 border-t border-white/10">
                        <span className="text-xs text-gray-400">
                          第 {list.page} / {totalPages} 頁
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={list.page <= 1 || isFetching}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />上一頁
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={list.page >= totalPages || isFetching}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            下一頁<ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
