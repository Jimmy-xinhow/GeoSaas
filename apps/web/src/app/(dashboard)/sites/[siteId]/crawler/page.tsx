'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Bot,
  Activity,
  Shield,
  Eye,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Code,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSite } from '@/hooks/use-sites'
import {
  useCrawlerDashboard,
  useCrawlerRobots,
  useCrawlerSnippet,
  useRegenerateToken,
} from '@/hooks/use-crawler'

const BOT_COLORS: Record<string, string> = {
  ClaudeBot: 'bg-orange-500/20 text-orange-300',
  GPTBot: 'bg-green-500/20 text-green-300',
  'ChatGPT-User': 'bg-green-500/20 text-green-300',
  'Google-Extended': 'bg-blue-500/20 text-blue-300',
  Googlebot: 'bg-blue-500/20 text-blue-300',
  Bingbot: 'bg-cyan-500/20 text-cyan-300',
  CopilotBot: 'bg-teal-500/20 text-teal-300',
  PerplexityBot: 'bg-purple-500/20 text-purple-300',
  YouBot: 'bg-pink-500/20 text-pink-300',
  CCBot: 'bg-white/10 text-gray-300',
  Bytespider: 'bg-red-500/20 text-red-300',
}

function BotCard({
  botName,
  count,
  lastVisit,
}: {
  botName: string
  count: number
  lastVisit: string
}) {
  const colorClass = BOT_COLORS[botName] || 'bg-white/10 text-gray-300'
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Badge className={colorClass}>{botName}</Badge>
          <span className="text-xs text-green-500 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            活躍
          </span>
        </div>
        <p className="text-2xl font-bold">{count}</p>
        <p className="text-xs text-muted-foreground">
          最後造訪: {new Date(lastVisit).toLocaleString('zh-TW')}
        </p>
      </CardContent>
    </Card>
  )
}

function RobotsPanel({
  siteId,
}: {
  siteId: string
}) {
  const { data: robots, isLoading } = useCrawlerRobots(siteId)

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />
  }

  if (!robots?.robotsTxt) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>尚未檢查 robots.txt</p>
        <p className="text-xs mt-1">系統會在每日凌晨 1 點自動檢查</p>
      </div>
    )
  }

  const allowedBots = (robots.allowedBots || {}) as Record<string, boolean>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-sm mb-2">各 Bot 存取狀態</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(allowedBots).map(([bot, allowed]) => (
            <div
              key={bot}
              className={`flex items-center justify-between p-2 rounded text-sm ${
                allowed
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-red-500/20 text-red-300'
              }`}
            >
              <span>{bot}</span>
              <Badge
                className={
                  allowed
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white'
                }
              >
                {allowed ? '允許' : '封鎖'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-medium text-sm mb-2">robots.txt 原始內容</h4>
        <pre className="p-3 bg-white/5 rounded-lg text-xs font-mono max-h-[200px] overflow-auto whitespace-pre-wrap">
          {robots.robotsTxt}
        </pre>
      </div>
      {robots.checkedAt && (
        <p className="text-xs text-muted-foreground">
          最後檢查: {new Date(robots.checkedAt).toLocaleString('zh-TW')}
        </p>
      )}
    </div>
  )
}

function SnippetGuide({ siteId }: { siteId: string }) {
  const { data: snippetData, isLoading } = useCrawlerSnippet(siteId)
  const regenerateMutation = useRegenerateToken()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (snippetData?.snippet) {
      navigator.clipboard.writeText(snippetData.snippet)
      setCopied(true)
      toast.success('追蹤碼已複製')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRegenerate = async () => {
    try {
      await regenerateMutation.mutateAsync(siteId)
      toast.success('Token 已重新產生')
    } catch {
      toast.error('重新產生失敗')
    }
  }

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="font-medium text-sm">安裝步驟</h4>
        <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
          <li>複製以下追蹤碼</li>
          <li>
            貼到您網站所有頁面的 &lt;head&gt; 或 &lt;body&gt; 結尾處
          </li>
          <li>部署後，AI 爬蟲的造訪記錄將自動出現在此頁面</li>
        </ol>
      </div>

      <div className="relative">
        <pre className="p-4 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-x-auto max-h-[300px]">
          {snippetData?.snippet || '載入中...'}
        </pre>
        <div className="absolute top-2 right-2 flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Token: {snippetData?.token?.substring(0, 12)}...
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerateMutation.isPending}
        >
          {regenerateMutation.isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          重新產生 Token
        </Button>
      </div>
    </div>
  )
}

export default function CrawlerPage() {
  const params = useParams()
  const siteId = params.siteId as string

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: dashboard, isLoading: dashLoading } =
    useCrawlerDashboard(siteId)

  if (siteLoading || dashLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">找不到網站</h2>
        <Link href="/sites">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回網站列表
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/sites/${siteId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回網站詳情
        </Link>
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              AI 爬蟲追蹤
            </h1>
            <p className="text-muted-foreground mt-1">
              {site.name} — 監控 AI 爬蟲對您網站的造訪
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {dashboard?.totalVisits || 0}
                </p>
                <p className="text-xs text-muted-foreground">總造訪</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Activity className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {dashboard?.last24h || 0}
                </p>
                <p className="text-xs text-muted-foreground">24h 活動</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Bot className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {dashboard?.uniqueBots || 0}
                </p>
                <p className="text-xs text-muted-foreground">獨立 Bot 數</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold capitalize">
                  {dashboard?.robotsStatus === 'checked' ? '已檢查' : '未檢查'}
                </p>
                <p className="text-xs text-muted-foreground">
                  robots.txt 狀態
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bots" className="w-full">
        <TabsList>
          <TabsTrigger value="bots">Bot 統計</TabsTrigger>
          <TabsTrigger value="visits">近期造訪</TabsTrigger>
          <TabsTrigger value="robots">robots.txt 分析</TabsTrigger>
          <TabsTrigger value="setup">追蹤碼安裝</TabsTrigger>
        </TabsList>

        <TabsContent value="bots">
          {!dashboard?.botStats || dashboard.botStats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white">
                  尚未偵測到 AI 爬蟲
                </h3>
                <p className="text-muted-foreground mt-1">
                  請先安裝追蹤碼，或等待 AI 爬蟲造訪您的網站
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboard.botStats.map((bot) => (
                <BotCard
                  key={bot.botName}
                  botName={bot.botName}
                  count={bot.count}
                  lastVisit={bot.lastVisit}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="visits">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">近期造訪記錄</CardTitle>
              <CardDescription>最新 20 筆 AI 爬蟲造訪</CardDescription>
            </CardHeader>
            <CardContent>
              {!dashboard?.recentVisits ||
              dashboard.recentVisits.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  尚無造訪記錄
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Bot</th>
                        <th className="pb-2 font-medium">組織</th>
                        <th className="pb-2 font-medium">URL</th>
                        <th className="pb-2 font-medium">狀態碼</th>
                        <th className="pb-2 font-medium">時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dashboard.recentVisits.map((v) => (
                        <tr key={v.id} className="hover:bg-white/5">
                          <td className="py-2">
                            <Badge
                              className={
                                BOT_COLORS[v.botName] ||
                                'bg-white/10 text-gray-300'
                              }
                            >
                              {v.botName}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {v.botOrg}
                          </td>
                          <td className="py-2 max-w-[200px] truncate">
                            {v.url}
                          </td>
                          <td className="py-2">
                            {v.statusCode ? (
                              <Badge
                                className={
                                  v.statusCode < 400
                                    ? 'bg-green-500/20 text-green-300'
                                    : 'bg-red-500/20 text-red-300'
                                }
                              >
                                {v.statusCode}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(v.visitedAt).toLocaleString('zh-TW')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="robots">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">robots.txt 分析</CardTitle>
              <CardDescription>
                檢查您的 robots.txt 對各 AI 爬蟲的允許/封鎖狀態
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RobotsPanel siteId={siteId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Code className="h-5 w-5" />
                追蹤碼安裝
              </CardTitle>
              <CardDescription>
                將以下 JavaScript 追蹤碼加入您的網站
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SnippetGuide siteId={siteId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
