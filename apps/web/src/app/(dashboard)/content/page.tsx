'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sparkles, Edit, Trash2, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { useContents, useDeleteContent } from '@/hooks/use-content'

function getTypeBadgeStyle(type: string) {
  switch (type) {
    case 'FAQ':
      return 'bg-purple-500/20 text-purple-300'
    case '文章':
    case 'article':
      return 'bg-blue-500/20 text-blue-300'
    case '知識庫':
    case 'knowledge-base':
      return 'bg-green-500/20 text-green-300'
    default:
      return 'bg-white/5 text-gray-300'
  }
}

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case '已發布':
    case 'published':
    case 'PUBLISHED':
      return 'bg-green-500/20 text-green-300'
    case '草稿':
    case 'draft':
    case 'DRAFT':
      return 'bg-white/5 text-gray-300'
    case '審核中':
    case 'review':
    case 'REVIEW':
      return 'bg-yellow-500/20 text-yellow-300'
    case 'ARCHIVED':
      return 'bg-gray-500/20 text-gray-300'
    default:
      return 'bg-white/5 text-gray-300'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'published':
    case 'PUBLISHED':
      return '已發布'
    case 'draft':
    case 'DRAFT':
      return '草稿'
    case 'review':
    case 'REVIEW':
      return '審核中'
    case 'ARCHIVED':
      return '已封存'
    default:
      return status
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'article':
    case 'ARTICLE':
      return '文章'
    case 'knowledge-base':
    case 'KNOWLEDGE_BASE':
      return '知識庫'
    case 'faq':
    case 'FAQ':
      return 'FAQ'
    default:
      return type
  }
}

function ContentCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <div className="flex gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ContentPage() {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: contents, isLoading, error } = useContents()
  const deleteContentMutation = useDeleteContent()

  if (error) {
    toast.error('無法載入內容資料', { id: 'content-error' })
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteContentMutation.mutateAsync(id)
      toast.success('內容已刪除')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '刪除失敗，請稍後再試')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="內容引擎"
        description="管理和生成 AI 優化內容"
        actions={
          <>
            <Link href="/published-content">
              <Button variant="outline">Geovault 為您發布</Button>
            </Link>
            <Link href="/content/new">
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                <Sparkles className="h-4 w-4 mr-2" />
                AI 生成
              </Button>
            </Link>
          </>
        }
      />

      {/* Content cards */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3, 4].map((i) => (
            <ContentCardSkeleton key={i} />
          ))}
        </div>
      ) : !contents || contents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">
                尚無內容
              </h3>
              <p className="text-muted-foreground mb-4">
                使用 AI 生成功能開始建立優化內容
              </p>
              <Link href="/content/new">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-2" />
                  建立第一篇內容
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {contents.map((item: any) => (
            <Card key={item.id} className="overflow-hidden transition-all">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white">{item.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-medium',
                          getTypeBadgeStyle(item.type)
                        )}
                      >
                        {getTypeLabel(item.type)}
                      </span>
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-medium',
                          getStatusBadgeStyle(item.status)
                        )}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString('zh-TW')
                          : item.date}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Link href={`/content/${item.id}`}>
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4 text-gray-400" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
