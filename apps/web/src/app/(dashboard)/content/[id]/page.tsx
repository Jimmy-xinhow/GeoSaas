'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clipboard, FileText, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { useContent, useDeleteContent, useUpdateContent } from '@/hooks/use-content'

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'REVIEW', label: '審核中' },
  { value: 'PUBLISHED', label: '已發布' },
  { value: 'ARCHIVED', label: '已封存' },
] as const

function normalizeStatus(value?: string) {
  const upper = (value || 'DRAFT').toUpperCase()
  return STATUS_OPTIONS.some((item) => item.value === upper) ? upper : 'DRAFT'
}

function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value)
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
  return Promise.resolve()
}

export default function ContentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { data: content, isLoading, error } = useContent(id)
  const updateContent = useUpdateContent()
  const deleteContent = useDeleteContent()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT')

  useEffect(() => {
    if (!content) return
    setTitle(content.title || '')
    setBody(content.body || '')
    setStatus(normalizeStatus(content.status) as typeof status)
  }, [content])

  const isDirty = useMemo(() => {
    if (!content) return false
    return (
      title !== content.title ||
      body !== (content.body || '') ||
      status !== normalizeStatus(content.status)
    )
  }, [body, content, status, title])

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('標題和內容不能空白')
      return
    }
    try {
      await updateContent.mutateAsync({
        id,
        title: title.trim(),
        body: body.trim(),
        status,
      })
      toast.success('內容已儲存')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '儲存失敗')
    }
  }

  const handleDelete = async () => {
    if (!content) return
    if (!window.confirm(`確定要刪除「${content.title}」嗎？此動作無法復原。`)) return
    try {
      await deleteContent.mutateAsync(id)
      toast.success('內容已刪除')
      router.push(content.siteId ? `/sites/${content.siteId}/content` : '/content')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '刪除失敗')
    }
  }

  const handleCopy = async () => {
    try {
      await copyText(body)
      toast.success('內容已複製')
    } catch {
      toast.error('複製失敗')
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="內容不存在" description="找不到這篇內容，或您沒有存取權限。" />
        <Link href="/content">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回內容列表
          </Button>
        </Link>
      </div>
    )
  }

  if (isLoading || !content) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="編輯內容"
        description="檢查 AI 生成內容並調整發布狀態"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={content.siteId ? `/sites/${content.siteId}/content` : '/content'}>
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回列表
              </Button>
            </Link>
            <Button variant="outline" onClick={handleCopy}>
              <Clipboard className="mr-2 h-4 w-4" />
              複製內容
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSave}
              disabled={!isDirty || updateContent.isPending}
            >
              {updateContent.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              儲存
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">內容設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label htmlFor="content-title">標題</Label>
              <Input
                id="content-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-status">狀態</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger id="content-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-body">內容</Label>
            <Textarea
              id="content-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-[460px] font-mono leading-relaxed"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {content.updatedAt
                ? `最後更新：${new Date(content.updatedAt).toLocaleString('zh-TW')}`
                : null}
            </p>
            <Button
              variant="outline"
              className="self-start text-red-300 hover:text-red-200"
              onClick={handleDelete}
              disabled={deleteContent.isPending}
            >
              {deleteContent.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              刪除內容
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
