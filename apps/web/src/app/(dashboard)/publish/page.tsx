'use client'

import { useState } from 'react'
import { Link2, Link2Off, ExternalLink, CheckCircle2, Clock, XCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { usePublications, usePublishContent } from '@/hooks/use-publish'
import { useContents } from '@/hooks/use-content'

const PLATFORMS = [
  {
    key: 'medium',
    name: 'Medium',
    icon: 'M',
    description: '技術部落格與內容發布平台',
    color: 'bg-black text-white',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    icon: 'in',
    description: '專業社群與企業品牌平台',
    color: 'bg-blue-700 text-white',
  },
  {
    key: 'wordpress',
    name: 'WordPress',
    icon: 'W',
    description: '自架部落格與內容管理系統',
    color: 'bg-blue-500 text-white',
  },
]

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; style: string }> = {
  PUBLISHED: {
    label: '已發布',
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    style: 'text-green-600 bg-green-50',
  },
  PENDING: {
    label: '排程中',
    icon: <Clock className="h-4 w-4 text-yellow-500" />,
    style: 'text-yellow-600 bg-yellow-50',
  },
  PUBLISHING: {
    label: '發布中',
    icon: <Clock className="h-4 w-4 text-blue-500" />,
    style: 'text-blue-600 bg-blue-50',
  },
  FAILED: {
    label: '發布失敗',
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    style: 'text-red-600 bg-red-50',
  },
}

export default function PublishPage() {
  const { data: publications, isLoading: pubLoading } = usePublications()
  const { data: contents } = useContents()
  const publishContent = usePublishContent()

  const [selectedContentId, setSelectedContentId] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // Compute which platforms have been used (have at least one PUBLISHED record)
  const connectedPlatforms = PLATFORMS.map((p) => {
    const published = publications?.some(
      (pub) => pub.platform.toLowerCase() === p.key && pub.status === 'PUBLISHED'
    )
    return { ...p, connected: !!published }
  })

  const handlePublish = () => {
    if (!selectedContentId || selectedPlatforms.length === 0) return
    publishContent.mutate(
      { contentId: selectedContentId, platforms: selectedPlatforms },
      {
        onSuccess: () => {
          setSelectedContentId('')
          setSelectedPlatforms([])
        },
      }
    )
  }

  const togglePlatform = (key: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  const publishedContents = contents?.filter((c: any) => c.status === 'PUBLISHED' || c.status === 'DRAFT') || []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">多平台佈局</h1>
        <p className="text-muted-foreground mt-1">
          連線各大平台，一鍵同步發布品牌內容
        </p>
      </div>

      {/* Quick publish */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            快速發布
          </CardTitle>
          <CardDescription>選擇內容和目標平台，一鍵發布</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">選擇內容</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={selectedContentId}
              onChange={(e) => setSelectedContentId(e.target.value)}
            >
              <option value="">-- 選擇要發布的內容 --</option>
              {publishedContents.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">選擇平台</label>
            <div className="flex gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => togglePlatform(p.key)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                    selectedPlatforms.includes(p.key)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className={cn('h-6 w-6 rounded flex items-center justify-center text-xs font-bold', p.color)}>
                    {p.icon}
                  </div>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!selectedContentId || selectedPlatforms.length === 0 || publishContent.isPending}
            onClick={handlePublish}
          >
            {publishContent.isPending ? '發布中...' : '發布到選定平台'}
          </Button>
          {publishContent.isSuccess && (
            <p className="text-sm text-green-600">已成功提交發布請求</p>
          )}
        </CardContent>
      </Card>

      {/* Connected platforms */}
      <div>
        <h3 className="text-lg font-semibold mb-4">平台狀態</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {connectedPlatforms.map((platform) => (
            <Card
              key={platform.name}
              className={cn(
                'transition-shadow hover:shadow-md',
                platform.connected ? 'border-green-200' : 'border-gray-200'
              )}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm',
                        platform.color
                      )}
                    >
                      {platform.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold">{platform.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {platform.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex items-center gap-1 text-sm font-medium',
                      platform.connected ? 'text-green-600' : 'text-gray-400'
                    )}
                  >
                    {platform.connected ? (
                      <>
                        <Link2 className="h-4 w-4" />
                        已使用
                      </>
                    ) : (
                      <>
                        <Link2Off className="h-4 w-4" />
                        尚未使用
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {publications?.filter((p) => p.platform.toLowerCase() === platform.key).length || 0} 篇
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Publish history */}
      <Card>
        <CardHeader>
          <CardTitle>發布記錄</CardTitle>
          <CardDescription>所有平台的內容發布歷史</CardDescription>
        </CardHeader>
        <CardContent>
          {pubLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !publications || publications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              尚無發布記錄，選擇內容開始發布吧
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
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
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">
                          {item.content?.title || '未知內容'}
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium capitalize">
                            {item.platform}
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                              statusInfo.style
                            )}
                          >
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString('zh-TW')
                            : '-'}
                        </td>
                        <td className="py-3">
                          {item.externalUrl && (
                            <a
                              href={item.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
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
