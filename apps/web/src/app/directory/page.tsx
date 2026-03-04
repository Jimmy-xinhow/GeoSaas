'use client'

import { useState } from 'react'
import {
  Search,
  Trophy,
  TrendingUp,
  Globe,
  Star,
  ChevronLeft,
  ChevronRight,
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
  type DirectorySite,
} from '@/hooks/use-directory'
import { INDUSTRIES } from '@geo-saas/shared'

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
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate block"
            >
              {site.url}
            </a>
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
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg">
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
  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard()
  const { data: stats, isLoading: statsLoading } = useDirectoryStats()
  const { data: newcomers } = useNewcomers()

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

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            排行榜 Top 10
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lbLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              尚無數據
            </p>
          ) : (
            <div className="divide-y">
              {leaderboard.map((site, i) => (
                <LeaderboardRow key={site.id} site={site} rank={i + 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
