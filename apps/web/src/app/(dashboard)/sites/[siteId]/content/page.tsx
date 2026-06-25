'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Edit, FileText, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { useSite } from '@/hooks/use-sites'
import { useContents, useDeleteContent } from '@/hooks/use-content'

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
