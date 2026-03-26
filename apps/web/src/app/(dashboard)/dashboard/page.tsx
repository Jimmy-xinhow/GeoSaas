'use client'

import { useState, useMemo } from 'react'
import {
  Globe,
  TrendingUp,
  MessageSquareQuote,
  FileText,
  Search,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useSites, useCreateSite } from '@/hooks/use-sites'
import { useTriggerScan, useScoreTrend } from '@/hooks/use-scan'
import { useContents } from '@/hooks/use-content'
import { useMonitorDashboard } from '@/hooks/use-monitor'

function getScoreStatus(score: number): string {
  if (score >= 80) return '優秀'
  if (score >= 60) return '良好'
  if (score >= 40) return '需改善'
  return '低分'
}

function getStatusColor(status: string) {
  switch (status) {
    case '優秀':
      return 'text-green-600 bg-green-50'
    case '良好':
      return 'text-blue-600 bg-blue-50'
    case '需改善':
      return 'text-yellow-600 bg-yellow-50'
    case '低分':
      return 'text-red-600 bg-red-50'
    default:
      return 'text-gray-600 bg-gray-50'
  }
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

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
          <Skeleton className="h-12 w-12 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [url, setUrl] = useState('')

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useSites()
  const { data: contents, isLoading: contentsLoading } = useContents()
  const { data: monitorData, isLoading: monitorLoading } = useMonitorDashboard()
  const createSiteMutation = useCreateSite()
  const triggerScanMutation = useTriggerScan()

  // Show errors as toast
  if (sitesError) {
    toast.error('無法載入網站資料', { id: 'sites-error' })
  }

  // Compute stats from real data
  const stats = useMemo(() => {
    const sitesCount = sites?.length ?? 0
    const avgScore = sites && sites.length > 0
      ? Math.round(
          sites.reduce((sum: number, s: any) => sum + (s.overallScore ?? s.score ?? 0), 0) / sites.length
        )
      : 0
    const citationCount = monitorData?.queries
      ? monitorData.queries.filter((q: any) => q.cited).length
      : 0
    const contentCount = contents?.length ?? 0

    return [
      {
        label: '已掃描網站',
        value: String(sitesCount),
        icon: Globe,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        label: '平均 GEO 分數',
        value: String(avgScore),
        icon: TrendingUp,
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
      {
        label: 'AI 引用次數',
        value: String(citationCount),
        icon: MessageSquareQuote,
        color: 'text-purple-600',
        bg: 'bg-purple-50',
      },
      {
        label: '已發布內容',
        value: String(contentCount),
        icon: FileText,
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      },
    ]
  }, [sites, contents, monitorData])

  // Build recent scans from sites data (sorted by updatedAt)
  const recentScans = useMemo(() => {
    if (!sites || sites.length === 0) return []
    return [...sites]
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map((site: any) => ({
        name: site.name || site.url,
        score: site.overallScore ?? site.score ?? 0,
        status: getScoreStatus(site.overallScore ?? site.score ?? 0),
        time: formatTimeAgo(site.updatedAt),
      }))
  }, [sites])

  const { data: scoreTrend } = useScoreTrend()
  const trendData = useMemo(() => {
    if (!scoreTrend || scoreTrend.length === 0) return []
    return scoreTrend.map((t) => ({
      month: new Date(t.date).toLocaleDateString('zh-TW', {
        month: 'short',
        day: 'numeric',
      }),
      score: t.score,
    }))
  }, [scoreTrend])

  const handleQuickScan = async () => {
    if (!url.trim()) {
      toast.error('請輸入網址')
      return
    }

    try {
      // First create the site, then trigger a scan
      const site = await createSiteMutation.mutateAsync({
        url: url.trim(),
        name: url.trim(),
      })
      await triggerScanMutation.mutateAsync(site.id)
      toast.success('掃描已啟動')
      setUrl('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '掃描失敗，請稍後再試')
    }
  }

  const isScanning = createSiteMutation.isPending || triggerScanMutation.isPending
  const isLoading = sitesLoading || contentsLoading || monitorLoading

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">總覽</h1>
        <p className="text-muted-foreground mt-1">歡迎回來，以下是您的 GEO 概況</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading
          ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          : stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-3xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <div className={cn('p-3 rounded-lg', stat.bg)}>
                      <stat.icon className={cn('h-6 w-6', stat.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Quick scan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            快速掃描
          </CardTitle>
          <CardDescription>輸入網址，立即分析您的網站 GEO 分數</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="輸入網址開始掃描..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleQuickScan()}
              disabled={isScanning}
            />
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleQuickScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  掃描中...
                </>
              ) : (
                '開始掃描'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent scans */}
        <Card>
          <CardHeader>
            <CardTitle>最近掃描</CardTitle>
          </CardHeader>
          <CardContent>
            {sitesLoading ? (
              <TableSkeleton />
            ) : recentScans.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">尚無掃描記錄</p>
                <p className="text-sm text-muted-foreground mt-1">
                  使用上方快速掃描開始分析您的網站
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">網站名稱</th>
                      <th className="pb-3 font-medium text-muted-foreground">分數</th>
                      <th className="pb-3 font-medium text-muted-foreground">狀態</th>
                      <th className="pb-3 font-medium text-muted-foreground">時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentScans.map((scan) => (
                      <tr key={scan.name} className="border-b last:border-0">
                        <td className="py-3 font-medium">{scan.name}</td>
                        <td className="py-3 font-semibold">{scan.score}</td>
                        <td className="py-3">
                          <span
                            className={cn(
                              'px-2 py-1 rounded-full text-xs font-medium',
                              getStatusColor(scan.status)
                            )}
                          >
                            {scan.status}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">{scan.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score trend chart */}
        <Card>
          <CardHeader>
            <CardTitle>分數趨勢</CardTitle>
            <CardDescription>過去 6 個月的平均 GEO 分數變化</CardDescription>
          </CardHeader>
          <CardContent>
            {sitesLoading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                      domain={[0, 100]}
                    />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
