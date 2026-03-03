'use client'

import { useState } from 'react'
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Radio,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useMonitorDashboard, useCreateMonitor } from '@/hooks/use-monitor'
import { useSites } from '@/hooks/use-sites'

// Default platform colors and icons mapping
const platformMeta: Record<string, { color: string; bgColor: string; textColor: string; icon: string }> = {
  ChatGPT: { color: 'bg-green-500', bgColor: 'bg-green-50', textColor: 'text-green-700', icon: '🤖' },
  Claude: { color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', icon: '🧠' },
  Perplexity: { color: 'bg-blue-500', bgColor: 'bg-blue-50', textColor: 'text-blue-700', icon: '🔍' },
  Gemini: { color: 'bg-purple-500', bgColor: 'bg-purple-50', textColor: 'text-purple-700', icon: '✨' },
}

const defaultPlatformMeta = { color: 'bg-gray-500', bgColor: 'bg-gray-50', textColor: 'text-gray-700', icon: '🔗' }

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-gray-400" />
}

function PlatformCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-5 w-20 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-2 w-full rounded-full mt-3" />
      </CardContent>
    </Card>
  )
}

function TableRowSkeleton() {
  return (
    <tr className="border-b last:border-0">
      <td className="py-3"><Skeleton className="h-4 w-48" /></td>
      <td className="py-3"><Skeleton className="h-5 w-20" /></td>
      <td className="py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="py-3"><Skeleton className="h-4 w-20" /></td>
    </tr>
  )
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  return `${diffDays} 天前`
}

const PLATFORM_OPTIONS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'gemini', label: 'Gemini' },
]

export default function MonitorPage() {
  const { data: monitorData, isLoading, error } = useMonitorDashboard()
  const { data: sites } = useSites()
  const createMonitor = useCreateMonitor()

  const [showForm, setShowForm] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [queryText, setQueryText] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState('')

  if (error) {
    toast.error('無法載入監控資料', { id: 'monitor-error' })
  }

  const platforms = monitorData?.platforms ?? []
  const queries = monitorData?.queries ?? []

  const handleCreateMonitor = async () => {
    if (!selectedSiteId) {
      toast.error('請選擇一個網站')
      return
    }
    if (!queryText.trim()) {
      toast.error('請輸入查詢內容')
      return
    }
    if (!selectedPlatform) {
      toast.error('請選擇一個平台')
      return
    }

    try {
      await createMonitor.mutateAsync({
        siteId: selectedSiteId,
        query: queryText.trim(),
        platform: selectedPlatform,
      })
      toast.success('監控查詢新增成功！')
      setShowForm(false)
      setSelectedSiteId('')
      setQueryText('')
      setSelectedPlatform('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '新增監控查詢失敗，請稍後再試')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI 引用監控</h1>
          <p className="text-muted-foreground mt-1">
            追蹤您的品牌在各大 AI 平台的引用狀況
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setShowForm((prev) => !prev)}
        >
          {showForm ? (
            <>
              <X className="h-4 w-4 mr-2" />
              取消
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              新增查詢
            </>
          )}
        </Button>
      </div>

      {/* Add query form */}
      {showForm && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-lg">新增監控查詢</CardTitle>
            <CardDescription>
              選擇網站和平台，輸入要追蹤的查詢內容
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>網站</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇網站" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sites ?? []).map((site: any) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>查詢內容</Label>
                <Input
                  placeholder="例如：最好的 SEO 工具"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>平台</Label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCreateMonitor}
                disabled={createMonitor.isPending}
              >
                {createMonitor.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    新增中...
                  </>
                ) : (
                  '新增查詢'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <PlatformCardSkeleton key={i} />)
        ) : platforms.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12">
              <div className="text-center">
                <Radio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  尚無平台資料
                </h3>
                <p className="text-muted-foreground">
                  新增查詢後將自動追蹤各平台引用狀態
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          platforms.map((platform: any) => {
            const meta = platformMeta[platform.name] || defaultPlatformMeta
            return (
              <Card key={platform.name}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl">{meta.icon}</span>
                    <div className="flex items-center gap-1">
                      <TrendIcon trend={platform.trend} />
                      <span
                        className={cn(
                          'text-xs font-medium',
                          platform.trend === 'up'
                            ? 'text-green-500'
                            : platform.trend === 'down'
                            ? 'text-red-500'
                            : 'text-gray-400'
                        )}
                      >
                        {platform.trendValue}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                  <div className="flex items-end gap-1 mt-1">
                    <span className="text-3xl font-bold">{platform.rate}%</span>
                    <span className="text-sm text-muted-foreground mb-1">
                      引用率
                    </span>
                  </div>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', meta.color)}
                      style={{ width: `${platform.rate}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Monitoring queries */}
      <Card>
        <CardHeader>
          <CardTitle>監控查詢列表</CardTitle>
          <CardDescription>追蹤特定查詢在 AI 平台中是否引用您的品牌</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">查詢內容</th>
                    <th className="pb-3 font-medium text-muted-foreground">平台</th>
                    <th className="pb-3 font-medium text-muted-foreground">引用狀態</th>
                    <th className="pb-3 font-medium text-muted-foreground">上次檢測</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRowSkeleton key={i} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : queries.length === 0 ? (
            <div className="text-center py-8">
              <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">尚無監控查詢</p>
              <p className="text-sm text-muted-foreground mt-1">
                點擊「新增查詢」開始追蹤 AI 引用狀態
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">
                      查詢內容
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      平台
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      引用狀態
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      上次檢測
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map((q: any, i: number) => (
                    <tr key={q.id || i} className="border-b last:border-0">
                      <td className="py-3 font-medium">{q.query}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                          {q.platform}
                        </span>
                      </td>
                      <td className="py-3">
                        {q.cited ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            已引用
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500">
                            <XCircle className="h-4 w-4" />
                            未引用
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {q.lastCheck
                          ? (typeof q.lastCheck === 'string' && q.lastCheck.includes('前'))
                            ? q.lastCheck
                            : formatTimeAgo(q.lastCheck)
                          : '尚未檢測'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
