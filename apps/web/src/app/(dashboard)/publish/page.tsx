'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Link2, Link2Off, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePublications, usePublishContent, usePublishPlatforms } from '@/hooks/use-publish'
import { useContents } from '@/hooks/use-content'

const PLATFORMS = [
  {
    key: 'medium',
    name: 'Medium',
    icon: 'M',
    description: '發布為 Medium 草稿',
    color: 'bg-black text-white',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    icon: 'in',
    description: '發布 LinkedIn 貼文',
    color: 'bg-blue-700 text-white',
  },
  {
    key: 'wordpress',
    name: 'WordPress',
    icon: 'W',
    description: '發布到客戶 WordPress 文章草稿',
    color: 'bg-blue-500 text-white',
  },
  {
    key: 'vocus',
    name: '方格子',
    icon: 'V',
    description: '發布為方格子文章草稿',
    color: 'bg-emerald-600 text-white',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    icon: 'f',
    description: '發布到 Facebook 粉絲頁',
    color: 'bg-blue-600 text-white',
  },
  {
    key: 'google_business',
    name: 'Google 商家檔案',
    icon: 'G',
    description: '發布 Google 商家最新消息',
    color: 'bg-red-500 text-white',
  },
]

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; style: string }> = {
  PUBLISHED: {
    label: '已發布',
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    style: 'text-green-400 bg-green-500/20',
  },
  PENDING: {
    label: '等待中',
    icon: <Clock className="h-4 w-4 text-yellow-500" />,
    style: 'text-yellow-400 bg-yellow-500/20',
  },
  PUBLISHING: {
    label: '發布中',
    icon: <Clock className="h-4 w-4 text-blue-500" />,
    style: 'text-blue-400 bg-blue-500/20',
  },
  FAILED: {
    label: '發布失敗',
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    style: 'text-red-400 bg-red-500/20',
  },
}

export default function PublishPage() {
  const { data: publications, isLoading: pubLoading, error: pubError } = usePublications()
  const { data: platformStatuses = [], isLoading: platformLoading } = usePublishPlatforms()
  const { data: contents, isLoading: contentsLoading, error: contentsError } = useContents()
  const publishContent = usePublishContent()

  const [selectedContentId, setSelectedContentId] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  if (pubError) {
    toast.error('無法載入發布記錄', { id: 'pub-error' })
  }
  if (contentsError) {
    toast.error('無法載入內容清單', { id: 'contents-error' })
  }

  const platformStatusMap = new Map(platformStatuses.map((item) => [item.key, item]))
  const platforms = PLATFORMS.map((platform) => ({
    ...platform,
    status: platformStatusMap.get(platform.key),
  }))
  const publishedContents = contents?.filter((c: any) => c.status === 'PUBLISHED' || c.status === 'DRAFT') || []

  const handlePublish = () => {
    if (!selectedContentId || selectedPlatforms.length === 0) return
    publishContent.mutate(
      { contentId: selectedContentId, platforms: selectedPlatforms },
      {
        onSuccess: () => {
          setSelectedContentId('')
          setSelectedPlatforms([])
          toast.success('已送出發布請求')
        },
        onError: (error: any) => {
          toast.error(error?.response?.data?.message || '發布失敗，請先確認平台已完成串接')
        },
      }
    )
  }

  const togglePlatform = (key: string) => {
    const status = platformStatusMap.get(key)
    if (!status?.configured) return
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold text-white">多平台佈局</h1>
        <p className="text-muted-foreground mt-1">
          只有完成平台授權或 API 設定的平台，才會開放一鍵發布。
        </p>
      </div>

      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            目前若客戶沒有提供 Medium、LinkedIn、WordPress、Facebook、Google 商家等平台授權，就不能直接替他發布。
            可用的替代方案是「Geovault 代發布內容資產」，把文章發布在 geovault.app，再由 AI 爬蟲讀取與引用。
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            快速發布
          </CardTitle>
          <CardDescription>選擇內容和已串接的平台，送出發布請求</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">選擇內容</label>
            {contentsLoading ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : publishedContents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                尚無可發布的內容，請先前往「內容引擎」生成內容。
              </p>
            ) : (
              <select
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                value={selectedContentId}
                onChange={(event) => setSelectedContentId(event.target.value)}
              >
                <option value="">-- 選擇要發布的內容 --</option>
                {publishedContents.map((content: any) => (
                  <option key={content.id} value={content.id}>
                    {content.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">選擇平台</label>
            <div className="flex flex-wrap gap-3">
              {platforms.map((platform) => {
                const configured = Boolean(platform.status?.configured)
                return (
                  <button
                    key={platform.key}
                    type="button"
                    onClick={() => togglePlatform(platform.key)}
                    disabled={!configured}
                    title={configured ? platform.description : `尚未串接：缺少 ${platform.status?.missingEnv.join(', ') || '平台設定'}`}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                      selectedPlatforms.includes(platform.key)
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-white/10 hover:border-white/20',
                      !configured && 'cursor-not-allowed opacity-45 hover:border-white/10'
                    )}
                  >
                    <div className={cn('h-6 w-6 rounded flex items-center justify-center text-xs font-bold', platform.color)}>
                      {platform.icon}
                    </div>
                    {platform.name}
                  </button>
                )
              })}
            </div>
          </div>

          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!selectedContentId || selectedPlatforms.length === 0 || publishContent.isPending}
            onClick={handlePublish}
          >
            {publishContent.isPending ? '發布中...' : '發布到選定平台'}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">平台串接狀態</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platforms.map((platform) => {
            const configured = Boolean(platform.status?.configured)
            return (
              <Card
                key={platform.key}
                className={cn(
                  'bg-white/5 transition-shadow hover:shadow-lg hover:shadow-blue-500/5',
                  configured ? 'border-green-500/30' : 'border-white/10'
                )}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm', platform.color)}>
                        {platform.icon}
                      </div>
                      <div>
                        <h4 className="font-semibold">{platform.name}</h4>
                        <p className="text-xs text-muted-foreground">{platform.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className={cn('flex items-center gap-1 text-sm font-medium', configured ? 'text-green-400' : 'text-gray-400')}>
                      {configured ? (
                        <>
                          <Link2 className="h-4 w-4" />
                          已串接，可發布
                        </>
                      ) : (
                        <>
                          <Link2Off className="h-4 w-4" />
                          尚未串接
                        </>
                      )}
                    </span>
                    {!configured && !platformLoading && (
                      <p className="text-xs text-gray-500">
                        缺少：{platform.status?.missingEnv.join('、') || '平台授權資料'}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      已建立 {publications?.filter((item) => item.platform.toLowerCase() === platform.key).length || 0} 筆發布紀錄
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle>發布記錄</CardTitle>
          <CardDescription>所有平台的內容發布歷史</CardDescription>
        </CardHeader>
        <CardContent>
          {pubLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 bg-white/10 rounded animate-pulse" />
              ))}
            </div>
          ) : !publications || publications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              尚無發布記錄。完成平台串接後，可從上方選擇內容發布。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 font-medium text-muted-foreground">內容標題</th>
                    <th className="pb-3 font-medium text-muted-foreground">平台</th>
                    <th className="pb-3 font-medium text-muted-foreground">狀態</th>
                    <th className="pb-3 font-medium text-muted-foreground">發布時間</th>
                    <th className="pb-3 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {publications.map((item) => {
                    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.PENDING
                    return (
                      <tr key={item.id} className="border-b border-white/10 last:border-0">
                        <td className="py-3 font-medium">{item.content?.title || '未知內容'}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 bg-white/10 rounded text-xs font-medium capitalize">
                            {item.platform}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', statusInfo.style)}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {item.publishedAt ? new Date(item.publishedAt).toLocaleString('zh-TW') : '-'}
                        </td>
                        <td className="py-3">
                          {item.externalUrl && (
                            <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
