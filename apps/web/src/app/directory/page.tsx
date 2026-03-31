'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Trophy,
  TrendingUp,
  Globe,
  Star,
  ChevronLeft,
  ChevronRight,
  Bot,
  Activity,
  Flame,
  Clock,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useDirectory,
  useLeaderboard,
  useDirectoryStats,
  useNewcomers,
  useCrawlerFeed,
  useTodayHottest,
  useMostCrawled,
  useRecentlyActive,
  useProgressStars,
  type DirectorySite,
  type RankedSite,
  type ProgressStar,
  type CrawlerFeedItem,
} from '@/hooks/use-directory'
import { INDUSTRIES } from '@geovault/shared'

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  bronze: { label: '銅牌', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  silver: { label: '銀牌', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  gold: { label: '金牌', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  platinum: { label: '白金', color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier || !TIER_CONFIG[tier]) return null
  const config = TIER_CONFIG[tier]
  return (
    <Badge className={`${config.color} border`}>
      {config.label}
    </Badge>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-green-500'
      : score >= 60
      ? 'bg-blue-500'
      : score >= 40
      ? 'bg-yellow-500'
      : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums w-8 text-right">
        {score}
      </span>
    </div>
  )
}

function SiteCard({ site }: { site: DirectorySite }) {
  const industryLabel = INDUSTRIES.find((i) => i.value === site.industry)?.label
  return (
    <Link href={`/directory/${site.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
              <span className="text-xs text-blue-600 truncate block">
                {site.url}
              </span>
            </div>
            <TierBadge tier={site.tier} />
          </div>
          <ScoreBar score={site.bestScore} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {industryLabel && (
              <span className="bg-gray-100 px-2 py-0.5 rounded">{industryLabel}</span>
            )}
            <span>
              {site.bestScoreAt
                ? new Date(site.bestScoreAt).toLocaleDateString('zh-TW')
                : ''}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function LeaderboardRow({
  site,
  rank,
}: {
  site: DirectorySite
  rank: number
}) {
  const medalEmoji =
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`

  return (
    <Link href={`/directory/${site.id}`}>
      <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg cursor-pointer">
        <span className="text-lg font-bold w-8 text-center">{medalEmoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{site.name}</p>
          <p className="text-xs text-muted-foreground truncate">{site.url}</p>
        </div>
        <TierBadge tier={site.tier} />
        <span className="text-lg font-bold tabular-nums text-blue-600">
          {site.bestScore}
        </span>
      </div>
    </Link>
  )
}

function CrawlerFeedRow({ item }: { item: CrawlerFeedItem }) {
  const timeAgo = getTimeAgo(item.visitedAt)
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-lg text-sm">
      <Bot className="h-4 w-4 text-purple-500 shrink-0" />
      <span className="font-medium text-gray-900 shrink-0">{item.botName}</span>
      <span className="text-muted-foreground truncate flex-1">
        {item.site.name}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
    </div>
  )
}

function getTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.floor(hours / 24)} 天前`
}

function ProgressStarsSection() {
  const { data: stars } = useProgressStars()

  if (!stars || stars.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          進步之星
          <span className="text-sm font-normal text-muted-foreground ml-1">
            分數提升最多的網站
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
          {stars.map((star) => (
            <Link key={star.id} href={`/directory/${star.id}`} className="snap-start">
              <div className="w-[220px] shrink-0 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer">
                <p className="font-semibold text-sm truncate text-gray-900">
                  {star.name}
                </p>
                <p className="text-xs text-muted-foreground truncate mb-3">
                  {star.url}
                </p>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-lg font-bold text-red-400">{star.firstScore}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-lg font-bold text-green-600">{star.bestScore}</span>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    +{star.improvement} 分
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{star.scanCount} 次掃描</span>
                  <span>{star.daysToImprove} 天</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const LEADERBOARD_TABS = [
  { key: 'score', label: '分數排行', icon: Trophy, color: 'text-yellow-500' },
  { key: 'today', label: '今日 AI 關注', icon: Flame, color: 'text-orange-500' },
  { key: 'crawled', label: '爬蟲造訪', icon: Zap, color: 'text-purple-500' },
  { key: 'recent', label: '最近更新', icon: Clock, color: 'text-blue-500' },
] as const

type LeaderboardTab = (typeof LEADERBOARD_TABS)[number]['key']

function LeaderboardTabs() {
  const [tab, setTab] = useState<LeaderboardTab>('score')
  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard()
  const { data: todayHottest } = useTodayHottest()
  const { data: mostCrawled } = useMostCrawled()
  const { data: recentlyActive } = useRecentlyActive()

  const currentData = useMemo(() => {
    switch (tab) {
      case 'score':
        return leaderboard?.map((s) => ({ ...s, metric: s.bestScore, metricLabel: '分' })) || []
      case 'today':
        return todayHottest?.map((s) => ({ ...s, metric: s.todayVisits ?? 0, metricLabel: '次' })) || []
      case 'crawled':
        return mostCrawled?.map((s) => ({ ...s, metric: s.totalVisits ?? 0, metricLabel: '次' })) || []
      case 'recent':
        return recentlyActive?.map((s) => ({ ...s, metric: s.lastScanScore ?? 0, metricLabel: '分' })) || []
    }
  }, [tab, leaderboard, todayHottest, mostCrawled, recentlyActive])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap gap-2">
          {LEADERBOARD_TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : t.color}`} />
                {t.label}
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {lbLoading && tab === 'score' ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : currentData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            尚無數據
          </p>
        ) : (
          <div className="divide-y">
            {currentData.map((site, i) => {
              const medalEmoji =
                i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
              return (
                <Link key={site.id} href={`/directory/${site.id}`}>
                  <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <span className="text-lg font-bold w-8 text-center">{medalEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{site.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                    </div>
                    <TierBadge tier={site.tier} />
                    <span className="text-lg font-bold tabular-nums text-blue-600">
                      {site.metric}
                      <span className="text-xs font-normal text-muted-foreground ml-0.5">
                        {site.metricLabel}
                      </span>
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DirectoryPage() {
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState<string>('')
  const [tier, setTier] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data: directory, isLoading: dirLoading } = useDirectory({
    search: search || undefined,
    industry: industry || undefined,
    tier: tier || undefined,
    page,
    limit: 12,
  })
  const { data: stats, isLoading: statsLoading } = useDirectoryStats()
  const { data: newcomers } = useNewcomers()
  const { data: crawlerFeed, isLoading: feedLoading } = useCrawlerFeed()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          GEO 優化目錄
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          探索已通過 AI SEO 優化認證的網站，查看分數排行與行業分類
        </p>
      </div>

      {/* Industry AI Recommendation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/industry/auto_care">
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:shadow-md transition cursor-pointer">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Bot className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-blue-900">汽車美容 AI 推薦排行</p>
                <p className="text-sm text-blue-600">看看哪些品牌最常被 AI 推薦 →</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/industry/traditional_medicine">
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:shadow-md transition cursor-pointer">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <Bot className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-green-900">整復推拿 AI 推薦排行</p>
                <p className="text-sm text-green-600">看看哪些品牌最常被 AI 推薦 →</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-blue-100 rounded-full">
              <Globe className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.totalSites || 0}
              </p>
              <p className="text-sm text-muted-foreground">收錄網站</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-green-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.avgScore || 0}
              </p>
              <p className="text-sm text-muted-foreground">平均分數</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-yellow-100 rounded-full">
              <Star className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  (stats?.tierDistribution?.gold || 0) +
                  (stats?.tierDistribution?.platinum || 0)
                )}
              </p>
              <p className="text-sm text-muted-foreground">金牌以上</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Crawler Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-500" />
            即時 AI 爬蟲動態
            {crawlerFeed?.stats && (
              <Badge variant="secondary" className="ml-auto text-xs font-normal">
                24h: {crawlerFeed.stats.last24h} 次造訪
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !crawlerFeed || crawlerFeed.feed.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              尚無爬蟲活動數據
            </p>
          ) : (
            <div>
              {crawlerFeed.stats.activeBots.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {crawlerFeed.stats.activeBots.map((bot) => (
                    <Badge key={bot.name} variant="outline" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" />
                      {bot.name}: {bot.count}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {crawlerFeed.feed.map((item) => (
                  <CrawlerFeedRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multi-dimension Leaderboards */}
      <LeaderboardTabs />

      {/* Progress Stars */}
      <ProgressStarsSection />

      {/* Industry Quick Links */}
      <div className="flex flex-wrap gap-2">
        {INDUSTRIES.map((ind) => (
          <Link key={ind.value} href={`/directory/industry/${ind.value}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 px-3 py-1.5 text-sm">
              {ind.label}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋網站名稱或網址..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={industry}
          onValueChange={(v) => {
            setIndustry(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="行業" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部行業</SelectItem>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind.value} value={ind.value}>
                {ind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tier}
          onValueChange={(v) => {
            setTier(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="等級" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等級</SelectItem>
            <SelectItem value="platinum">白金</SelectItem>
            <SelectItem value="gold">金牌</SelectItem>
            <SelectItem value="silver">銀牌</SelectItem>
            <SelectItem value="bronze">銅牌</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Site Grid */}
      {dirLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-full rounded-lg" />
          ))}
        </div>
      ) : !directory || directory.items.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">尚無收錄網站</h3>
          <p className="text-muted-foreground mt-1">
            目前沒有符合條件的公開網站
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {directory.items.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>

          {/* Pagination */}
          {directory.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {page} / {directory.totalPages} 頁
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= directory.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Newcomers */}
      {newcomers && newcomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新進網站（近 30 天）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newcomers.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
