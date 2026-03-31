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
  bronze: { label: '銅牌', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  silver: { label: '銀牌', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  gold: { label: '金牌', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  platinum: { label: '白金', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
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
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
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
      <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white truncate">{site.name}</h3>
              <span className="text-xs text-blue-600 truncate block">
                {site.url}
              </span>
            </div>
            <TierBadge tier={site.tier} />
          </div>
          <ScoreBar score={site.bestScore} />
          <div className="flex items-center justify-between text-xs text-gray-400">
            {industryLabel && (
              <span className="bg-white/10 px-2 py-0.5 rounded">{industryLabel}</span>
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
      <div className="flex items-center gap-4 py-3 px-4 hover:bg-white/5 rounded-lg cursor-pointer">
        <span className="text-lg font-bold w-8 text-center">{medalEmoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{site.name}</p>
          <p className="text-xs text-gray-500 truncate">{site.url}</p>
        </div>
        <TierBadge tier={site.tier} />
        <span className="text-lg font-bold tabular-nums text-blue-400">
          {site.bestScore}
        </span>
      </div>
    </Link>
  )
}

function CrawlerFeedRow({ item }: { item: CrawlerFeedItem }) {
  const timeAgo = getTimeAgo(item.visitedAt)
  const isRecent = Date.now() - new Date(item.visitedAt).getTime() < 300000 // < 5 min
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-white/5 rounded-lg text-sm animate-fade-in-up">
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isRecent ? 'bg-green-400 animate-live-dot' : 'bg-gray-600'}`} />
      <Bot className="h-4 w-4 text-purple-400 shrink-0" />
      <span className="font-medium text-white shrink-0">{item.botName}</span>
      <span className="text-gray-400 truncate flex-1">
        {item.site.name}
      </span>
      <span className={`text-xs shrink-0 ${isRecent ? 'text-green-400' : 'text-gray-500'}`}>{timeAgo}</span>
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
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Star className="h-5 w-5 text-yellow-500" />
          進步之星
          <span className="text-sm font-normal text-gray-400 ml-1">
            分數提升最多的網站
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
          {stars.map((star) => (
            <Link key={star.id} href={`/directory/${star.id}`} className="snap-start">
              <div className="w-[220px] shrink-0 bg-white/5 border border-yellow-500/30 rounded-xl p-4 hover:bg-white/10 transition-colors cursor-pointer">
                <p className="font-semibold text-sm truncate text-white">
                  {star.name}
                </p>
                <p className="text-xs text-gray-400 truncate mb-3">
                  {star.url}
                </p>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-lg font-bold text-red-400">{star.firstScore}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-lg font-bold text-green-400">{star.bestScore}</span>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                    +{star.improvement} 分
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
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
    <Card className="bg-white/5 border-white/10">
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
                    ? 'bg-white text-gray-900'
                    : 'bg-white/10 text-gray-400 hover:bg-white/15'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-gray-900' : t.color}`} />
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
          <p className="text-center text-gray-500 py-8">
            尚無數據
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {currentData.map((site, i) => {
              const medalEmoji =
                i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
              return (
                <Link key={site.id} href={`/directory/${site.id}`}>
                  <div className="flex items-center gap-4 py-3 px-4 hover:bg-white/5 rounded-lg cursor-pointer">
                    <span className="text-lg font-bold w-8 text-center">{medalEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{site.name}</p>
                      <p className="text-xs text-gray-500 truncate">{site.url}</p>
                    </div>
                    <TierBadge tier={site.tier} />
                    <span className="text-lg font-bold tabular-nums text-blue-400">
                      {site.metric}
                      <span className="text-xs font-normal text-gray-500 ml-0.5">
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
    <div className="bg-gray-900 text-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">
          GEO 優化目錄
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          探索已通過 AI SEO 優化認證的網站，查看分數排行與行業分類
        </p>
      </div>

      {/* Stats — Live updating */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10 animate-glow-pulse">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-blue-500/20 rounded-full">
              <Globe className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.totalSites || 0}
                </p>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-live-dot" />
              </div>
              <p className="text-sm text-gray-400">收錄網站</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-green-500/20 rounded-full">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.avgScore || 0}
                </p>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-live-dot" style={{ animationDelay: '0.5s' }} />
              </div>
              <p className="text-sm text-gray-400">平均分數</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-yellow-500/20 rounded-full">
              <Star className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">
                  {statsLoading ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    (stats?.tierDistribution?.gold || 0) +
                    (stats?.tierDistribution?.platinum || 0)
                  )}
                </p>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-live-dot" style={{ animationDelay: '1s' }} />
              </div>
              <p className="text-sm text-gray-400">金牌以上</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Crawler Feed — Marquee */}
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-400 animate-live-pulse" />
            <span className="font-semibold text-white text-sm">即時 AI 爬蟲動態</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-live-dot" />
              LIVE
            </span>
          </div>
          {crawlerFeed?.stats && (
            <div className="flex items-center gap-3">
              {crawlerFeed.stats.activeBots.slice(0, 4).map((bot) => (
                <span key={bot.name} className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Bot className="h-3 w-3 text-purple-400" />
                  {bot.name}: {bot.count}
                </span>
              ))}
              <span className="text-xs text-gray-500">24h: {crawlerFeed.stats.last24h}</span>
            </div>
          )}
        </div>
        {feedLoading ? (
          <div className="px-5 py-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !crawlerFeed || crawlerFeed.feed.length === 0 ? (
          <p className="text-center text-gray-500 py-6 text-sm">尚無爬蟲活動數據</p>
        ) : (
          <div className="py-3 overflow-hidden">
            <div className="flex items-center gap-10 animate-marquee-dir whitespace-nowrap">
              {[...crawlerFeed.feed, ...crawlerFeed.feed].map((item, i) => (
                <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 text-sm shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    Date.now() - new Date(item.visitedAt).getTime() < 300000
                      ? 'bg-green-400 animate-live-dot'
                      : 'bg-gray-600'
                  }`} />
                  <span className="text-purple-400 font-medium">{item.botName}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-gray-400">{item.site.name}</span>
                  <span className="text-xs text-yellow-200/40">{getTimeAgo(item.visitedAt)}</span>
                </span>
              ))}
            </div>
            <style jsx>{`
              @keyframes marquee-dir { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
              .animate-marquee-dir { animation: marquee-dir ${Math.max(crawlerFeed.feed.length * 4, 30)}s linear infinite; }
            `}</style>
          </div>
        )}
      </div>

      {/* Multi-dimension Leaderboards */}
      <LeaderboardTabs />

      {/* Progress Stars */}
      <ProgressStarsSection />

      {/* Industry Quick Links */}
      <div className="flex flex-wrap gap-2">
        {INDUSTRIES.map((ind) => (
          <Link key={ind.value} href={`/directory/industry/${ind.value}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-white/10 border-white/20 text-gray-300 px-3 py-1.5 text-sm">
              {ind.label}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="搜尋網站名稱或網址..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-10 bg-white/10 border-white/10 text-white placeholder:text-gray-500"
          />
        </div>
        <Select
          value={industry}
          onValueChange={(v) => {
            setIndustry(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px] bg-white/10 border-white/10 text-white">
            <SelectValue placeholder="行業" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-white/10">
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
          <SelectTrigger className="w-[130px] bg-white/10 border-white/10 text-white">
            <SelectValue placeholder="等級" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-white/10">
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
          <Globe className="h-12 w-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">尚無收錄網站</h3>
          <p className="text-gray-500 mt-1">
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
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-400">
                第 {page} / {directory.totalPages} 頁
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= directory.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Newcomers */}
      {newcomers && newcomers.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-base text-white">新進網站（近 30 天）</CardTitle>
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
