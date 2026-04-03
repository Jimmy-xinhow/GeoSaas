'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Globe,
  Calendar,
  MessageSquare,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScoreGauge } from '@/components/scan/score-gauge'
import { IndicatorCard } from '@/components/scan/indicator-card'
import ScanHistoryChart from '@/components/scan/scan-history-chart'
import { useSiteDetail, type DirectorySiteDetail } from '@/hooks/use-directory'
import { ScanIndicatorLabel, ScanIndicator } from '@geovault/shared'
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
    <Badge className={`${config.color} border text-sm px-3 py-1`}>
      {config.label}
    </Badge>
  )
}

function JsonLdScript({ site }: { site: DirectorySiteDetail }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: site.name,
        url: site.url,
        ...(site.industry && { industry: site.industry }),
        ...(site.profile?.description && { description: site.profile.description }),
        ...(site.profile?.logo && { logo: site.profile.logo }),
      },
      {
        '@type': 'WebSite',
        name: site.name,
        url: site.url,
      },
      ...(site.qas.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: site.qas.map((qa) => ({
                '@type': 'Question',
                name: qa.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: qa.answer,
                },
              })),
            },
          ]
        : []),
      {
        '@type': 'LocalBusiness',
        name: site.name,
        url: site.url,
        description: site.profile?.description || `${site.name} — GEO Score: ${site.bestScore}/100`,
        ...(site.industry && { industry: site.industry }),
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: site.bestScore,
          bestRating: 100,
          worstRating: 0,
          ratingCount: site.latestScan ? 1 : 0,
        },
        review: {
          '@type': 'Review',
          author: { '@type': 'Organization', name: 'Geovault', url: 'https://www.geovault.app' },
          reviewRating: {
            '@type': 'Rating',
            ratingValue: site.bestScore,
            bestRating: 100,
            worstRating: 0,
          },
          name: `${site.name} GEO AI 可讀性評分`,
          reviewBody: `${site.name} 的 GEO 分數為 ${site.bestScore}/100，由 Geovault 平台的 9 項 AI 可讀性指標評估。`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: 'https://www.geovault.app' },
          { '@type': 'ListItem', position: 2, name: '品牌目錄', item: 'https://www.geovault.app/directory' },
          { '@type': 'ListItem', position: 3, name: site.name },
        ],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

function getTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.floor(days / 30)} 個月前`
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[300px] lg:col-span-1" />
        <Skeleton className="h-[300px] lg:col-span-2" />
      </div>
      <Skeleton className="h-[200px]" />
      <Skeleton className="h-[300px]" />
    </div>
  )
}

export default function SiteDetailClient({ siteId }: { siteId: string }) {
  const { data: site, isLoading, isError } = useSiteDetail(siteId)

  if (isLoading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DetailSkeleton />
      </div>
    )
  }

  if (isError || !site) {
    return (
      <div className="bg-gray-900 text-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <Globe className="h-16 w-16 text-gray-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">找不到此網站</h1>
        <p className="text-gray-400 mb-6">此網站不存在或尚未公開。</p>
        <Link href="/directory">
          <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回目錄
          </Button>
        </Link>
      </div>
    )
  }

  const industryLabel = INDUSTRIES.find((i) => i.value === site.industry)?.label
  const chartData = site.scoreTrend.map((t) => ({
    month: new Date(t.date).toLocaleDateString('zh-TW', {
      month: 'short',
      day: 'numeric',
    }),
    score: t.score,
  }))

  return (
    <div className="bg-gray-900 text-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <JsonLdScript site={site} />

      {/* Back link */}
      <Link
        href="/directory"
        className="inline-flex items-center text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        返回目錄
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white/5 border-white/10">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">
                    {site.name}
                  </h1>
                  <TierBadge tier={site.tier} />
                </div>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  {site.url}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-gray-400">
              {industryLabel && (
                <span className="inline-flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                  {industryLabel}
                </span>
              )}
              {site.bestScoreAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  最後掃描：{new Date(site.bestScoreAt).toLocaleDateString('zh-TW')}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                收錄：{new Date(site.createdAt).toLocaleDateString('zh-TW')}
              </span>
            </div>

            {site.profile?.description && (
              <p className="text-gray-400 text-sm leading-relaxed">
                {site.profile.description}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="flex items-center justify-center bg-white/5 border-white/10">
          <CardContent className="p-6 text-center">
            <ScoreGauge score={site.bestScore} size={180} />
            <p className="text-sm text-gray-400 mt-2">GEO 總分</p>
          </CardContent>
        </Card>
      </div>

      {/* Badges */}
      {site.badges && site.badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {site.badges.map((b) => (
            <div
              key={b.badge}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-sm"
            >
              <Award className="h-3.5 w-3.5 text-yellow-400" />
              <span className="font-medium text-yellow-400">{b.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Indicator Breakdown */}
      {site.latestScan && site.latestScan.results.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">AI 優化指標明細</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {site.latestScan.results.map((r) => (
                <IndicatorCard
                  key={r.indicator}
                  name={
                    ScanIndicatorLabel[r.indicator as ScanIndicator] ||
                    r.indicator
                  }
                  score={r.score}
                  status={r.status as 'pass' | 'warning' | 'fail'}
                  suggestion={r.suggestion || undefined}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Crawler Activity */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Bot className="h-5 w-5 text-purple-500" />
            AI 爬蟲造訪紀錄
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              共 {site.crawlerActivity.totalVisits} 次造訪
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {site.crawlerActivity.bots.length === 0 ? (
            <p className="text-center text-gray-500 py-6">
              尚無 AI 爬蟲造訪紀錄
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-gray-400">
                    <th className="pb-3 font-medium">Bot 名稱</th>
                    <th className="pb-3 font-medium">組織</th>
                    <th className="pb-3 font-medium text-right">造訪次數</th>
                    <th className="pb-3 font-medium text-right">最後造訪</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {site.crawlerActivity.bots.map((bot) => (
                    <tr key={bot.name} className="hover:bg-white/5">
                      <td className="py-3 font-medium">{bot.name}</td>
                      <td className="py-3 text-gray-400">{bot.org}</td>
                      <td className="py-3 text-right tabular-nums">
                        {bot.visitCount}
                      </td>
                      <td className="py-3 text-right text-gray-500">
                        {getTimeAgo(bot.lastVisit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Trend */}
      {chartData.length > 1 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">分數趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <ScanHistoryChart data={chartData} />
          </CardContent>
        </Card>
      )}

      {/* Knowledge Base Preview */}
      {site.qas.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              品牌知識庫
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {site.qas.map((qa) => (
                <div
                  key={qa.id}
                  className="border border-white/10 rounded-lg p-4 space-y-2"
                >
                  <p className="font-medium text-white">{qa.question}</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {qa.answer}
                  </p>
                  {qa.category && (
                    <Badge variant="outline" className="text-xs">
                      {qa.category}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold">想讓你的品牌也獲得這樣的曝光？</h2>
        <p className="mt-2 text-blue-100">
          免費掃描你的網站，查看 AI 可見度分數並開始優化。
        </p>
        <Link href="/register" className="inline-block mt-6">
          <Button
            size="lg"
            className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-10"
          >
            免費開始
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
