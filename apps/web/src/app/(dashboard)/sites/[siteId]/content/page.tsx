'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Edit, FileText, Plus, Trash2, Loader2, Sparkles, ExternalLink, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { useSite } from '@/hooks/use-sites'
import { useContents, useDeleteContent } from '@/hooks/use-content'
import { useClientDailyList, type ClientDailyDayType } from '@/hooks/use-client-reports'

const DAILY_DAY_LABELS: Record<ClientDailyDayType, { label: string; color: string }> = {
  mon_topical:     { label: '週一 · 話題解析', color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
  tue_qa_deepdive: { label: '週二 · Q&A 深度', color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  wed_service:     { label: '週三 · 服務剖析', color: 'text-purple-300 border-purple-500/30 bg-purple-500/10' },
  thu_audience:    { label: '週四 · 受眾指引', color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  fri_comparison:  { label: '週五 · 對比差異', color: 'text-pink-300 border-pink-500/30 bg-pink-500/10' },
  sat_data_pulse:  { label: '週六 · 數據脈動', color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
}

const DAILY_PREVIEW_COUNT = 6

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export default function SiteContentPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { data: site } = useSite(siteId)
  const { data: allContents, isLoading } = useContents()
  const deleteContent = useDeleteContent()
  const { data: dailyList, isLoading: dailyLoading } = useClientDailyList(
    siteId,
    1,
    DAILY_PREVIEW_COUNT,
  )

  const contents = useMemo(
    () => (allContents ?? []).filter((c) => c.siteId === siteId),
    [allContents, siteId],
  )

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`確定要刪除「${title}」嗎？`)) return
    deleteContent.mutate(id, {
      onSuccess: () => toast.success('已刪除內容'),
      onError: () => toast.error('刪除失敗，請稍後再試'),
    })
  }

  return (
    <div className="space-y-6">
      <SiteWorkspaceTabs siteId={siteId} siteName={site?.name} />

      <PageHeader
        title="內容"
        description={`${site?.name ?? '這個網站'}的 AI 優化內容資產`}
        actions={
          <Link href={`/content/new?siteId=${siteId}`}>
            <Button className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              生成內容
            </Button>
          </Link>
        }
      />

      {/* Geovault 為您發布（client_daily 自動發布內容，與下方手動內容資產不同來源） */}
      <Card className="border-blue-500/20 bg-blue-500/[0.03]">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-blue-300" />
            Geovault 平台文章
            {dailyList && dailyList.total > 0 && (
              <span className="text-xs font-normal text-gray-400">
                （共 {dailyList.total} 篇）
              </span>
            )}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <Link
              href={`/sites/${siteId}/official-content`}
              className="text-emerald-300 hover:underline"
            >
              官網專屬內容
            </Link>
            <Link
              href="/published-content"
              className="text-blue-400 hover:underline"
            >
              Geovault 平台記錄
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {dailyLoading && !dailyList ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !dailyList || dailyList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              這個網站還沒有自動發布的內容。Geovault 會依方案配額自動為付費網站撰寫並發布 AI 可引用文章。
            </p>
          ) : (
            <div className="space-y-2">
              {dailyList.items.map((article) => {
                const dayMeta = article.dayType ? DAILY_DAY_LABELS[article.dayType] : null
                const publicVisible = article.publicVisible !== false
                const dateStr = new Intl.DateTimeFormat('zh-TW', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                }).format(new Date(article.createdAt))
                const inner = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white group-hover:text-blue-300">
                        {article.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {dayMeta && (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${dayMeta.color}`}>
                            {dayMeta.label}
                          </span>
                        )}
                        {!publicVisible && (
                          <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                            未公開
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Calendar className="h-3 w-3" />
                          {dateStr}
                        </span>
                        <span className="text-[10px] text-gray-500">{article.charLength} 字</span>
                      </div>
                    </div>
                    {publicVisible && <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 group-hover:text-blue-400" />}
                  </div>
                )
                return publicVisible ? (
                  <a
                    key={article.slug}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:border-blue-500/30 hover:bg-white/10"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    key={article.slug}
                    href="/published-content"
                    className="group block rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3 transition-colors hover:bg-amber-500/10"
                  >
                    {inner}
                  </Link>
                )
              })}
              {dailyList.total > dailyList.items.length && (
                <Link
                  href="/published-content"
                  className="block pt-1 text-center text-xs text-blue-400 hover:underline"
                >
                  還有 {dailyList.total - dailyList.items.length} 篇，前往 Geovault 平台發布記錄查看全部 →
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <FileText className="h-3.5 w-3.5" />
        手動內容資產
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-9 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : contents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gray-400">
              <FileText className="h-6 w-6" />
            </span>
            <p className="text-base font-semibold text-white">這個網站還沒有內容</p>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-gray-400">
              生成第一篇 AI 優化內容，讓 ChatGPT、Gemini 等更容易引用這個品牌。
            </p>
            <Link href={`/content/new?siteId=${siteId}`}>
              <Button className="mt-5 bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                生成內容
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contents.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-blue-300">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{c.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <Badge variant="secondary">{c.type}</Badge>
                      <span>{formatDate(c.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={`/content/${c.id}`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:bg-white/10 hover:text-blue-300"
                      aria-label={`編輯 ${c.title}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => handleDelete(c.id, c.title)}
                    disabled={deleteContent.isPending}
                    aria-label={`刪除 ${c.title}`}
                  >
                    {deleteContent.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
