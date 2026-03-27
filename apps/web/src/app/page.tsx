'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Wrench,
  Sparkles,
  Share2,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGuestScan, useGuestScanStatus } from '@/hooks/use-guest-scan'
import { useSubmitIndexNow } from '@/hooks/use-indexnow'
import { useCrawlerFeed, usePlatformStats } from '@/hooks/use-directory'
import { LanguageSwitcher } from '@/components/language-switcher'
import { useTranslations } from 'next-intl'

const features = [
  {
    icon: Search,
    title: 'AI 診斷引擎',
    description: '8 項核心指標全面掃描，深度分析您的品牌在 AI 搜尋中的可見度。',
  },
  {
    icon: Wrench,
    title: '自動修復工具',
    description: '一鍵生成 JSON-LD 結構化資料和 llms.txt，快速提升 GEO 分數。',
  },
  {
    icon: Sparkles,
    title: 'AI 內容引擎',
    description: '自動生成 FAQ、權威文章和品牌知識庫，讓 AI 更了解您的品牌。',
  },
  {
    icon: Share2,
    title: '多平台佈局',
    description: '同步發布到 Medium、LinkedIn、WordPress 等平台，擴大品牌影響力。',
  },
]

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '/月',
    features: ['3 次掃描/月', '1 個網站', '基礎 GEO 報告', '社群支援'],
    cta: '免費開始',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$49',
    period: '/月',
    features: [
      '30 次掃描/月',
      '5 個網站',
      '修復工具',
      '匯出報告',
      'Email 支援',
    ],
    cta: '選擇方案',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/月',
    features: [
      '100 次掃描/月',
      '20 個網站',
      'AI 內容引擎',
      'AI 引用監控',
      '多平台發布',
      '優先支援',
    ],
    cta: '選擇方案',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: '/月',
    features: [
      '無限量掃描',
      '無限網站',
      'API 存取',
      '白標解決方案',
      '專屬客戶經理',
      '自訂整合',
    ],
    cta: '聯繫我們',
    popular: false,
  },
]

const STATUS_ICON = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  fail: XCircle,
}

const STATUS_COLOR = {
  pass: 'text-green-600',
  warning: 'text-yellow-600',
  fail: 'text-red-500',
}

function PlatformStatsBar() {
  const { data: stats } = usePlatformStats()

  const items = [
    { label: '收錄網站', value: stats?.totalSites ?? 0 },
    { label: '完成掃描', value: stats?.totalScans ?? 0 },
    { label: '爬蟲造訪', value: stats?.totalCrawlerVisits ?? 0 },
    { label: '24h 造訪', value: stats?.crawlerVisits24h ?? 0 },
    { label: '活躍 Bot', value: stats?.activeBots ?? 0 },
  ]

  return (
    <div className="bg-white border-b border-gray-100 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-around px-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {item.value.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrawlerMarquee() {
  const { data: crawlerFeed } = useCrawlerFeed()

  if (!crawlerFeed || crawlerFeed.feed.length === 0) return null

  const items = crawlerFeed.feed
  // Duplicate for seamless scrolling
  const doubled = [...items, ...items]

  return (
    <div className="bg-gray-900 text-white py-2.5 overflow-hidden">
      <div className="flex items-center gap-8 animate-marquee whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-purple-300 font-medium">{item.botName}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-300">{item.site?.name || item.url}</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee ${Math.max(items.length * 3, 20)}s linear infinite;
        }
      `}</style>
    </div>
  )
}

function IndexNowButton({ url }: { url: string }) {
  const submitIndexNow = useSubmitIndexNow()
  const successCount = submitIndexNow.data?.results?.filter((r) => r.success).length ?? 0
  const totalCount = submitIndexNow.data?.results?.length ?? 0

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
      <button
        onClick={() => submitIndexNow.mutate(url)}
        disabled={submitIndexNow.isPending || submitIndexNow.isSuccess}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all text-sm',
          submitIndexNow.isSuccess
            ? 'bg-green-500/30 text-green-200 cursor-default'
            : 'bg-orange-500/30 text-orange-200 hover:bg-orange-500/50 cursor-pointer',
          submitIndexNow.isPending && 'opacity-60 cursor-wait',
        )}
      >
        {submitIndexNow.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            通知中...
          </>
        ) : submitIndexNow.isSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            已通知 {successCount}/{totalCount} 個搜尋引擎
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            通知搜尋引擎更新（IndexNow）
          </>
        )}
      </button>
      {submitIndexNow.isSuccess && (
        <div className="mt-2 space-y-1">
          {submitIndexNow.data?.results?.map((r) => (
            <div key={r.engine} className="flex items-center justify-between text-xs px-2">
              <span className="text-white/60">{r.engine}</span>
              <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                {r.success ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GuestScanResults({ scanId }: { scanId: string }) {
  const { data: scan } = useGuestScanStatus(scanId)

  if (!scan) return null

  if (scan.status === 'PENDING' || scan.status === 'RUNNING') {
    return (
      <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-3 text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-lg">
            {scan.status === 'PENDING' ? '排隊中...' : '掃描進行中...'}
          </span>
        </div>
      </div>
    )
  }

  if (scan.status === 'FAILED') {
    return (
      <div className="mt-8 bg-red-500/20 backdrop-blur-sm rounded-2xl p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-2 text-white">
          <AlertCircle className="h-5 w-5" />
          <span>掃描失敗，請稍後再試</span>
        </div>
      </div>
    )
  }

  const indicators = scan.results?.indicators
  if (!indicators) return null

  const scoreColor =
    scan.totalScore >= 80
      ? 'text-green-300'
      : scan.totalScore >= 60
      ? 'text-blue-200'
      : scan.totalScore >= 40
      ? 'text-yellow-300'
      : 'text-red-300'

  return (
    <div className="mt-8 max-w-2xl mx-auto space-y-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
        <p className="text-blue-200 text-sm mb-1">您的 GEO 分數</p>
        <p className={`text-6xl font-bold ${scoreColor}`}>
          {scan.totalScore}
        </p>
        <p className="text-blue-200 text-sm mt-2">/ 100</p>
      </div>

      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">指標詳情</h3>
        <div className="space-y-3">
          {Object.entries(indicators).map(([name, result]) => {
            const Icon = STATUS_ICON[result.status]
            const color = STATUS_COLOR[result.status]
            return (
              <div
                key={name}
                className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-white text-sm">{name}</span>
                </div>
                <span className="text-white font-semibold tabular-nums">
                  {result.score}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <IndexNowButton url={scan.url} />

      <div className="text-center">
        <Link href="/register">
          <Button
            size="lg"
            className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-10"
          >
            註冊解鎖完整報告 & 自動修復
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [scanUrl, setScanUrl] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const router = useRouter()
  const guestScan = useGuestScan()

  const handleScan = () => {
    if (!scanUrl.trim()) return
    let url = scanUrl.trim()
    if (!/^https?:\/\//.test(url)) url = `https://${url}`
    guestScan.mutate(url, {
      onSuccess: (data) => setScanId(data.id),
    })
  }

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white/80 backdrop-blur-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Geovault
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              功能
            </a>
            <a
              href="#pricing"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              定價
            </a>
            <Link
              href="/directory"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              目錄
            </Link>
            <Link
              href="/blog"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/news"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              News
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login">
            <Button variant="ghost" size="sm">
              登入
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              免費開始
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 lg:py-28 text-center bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            讓 AI 優先推薦
            <br />
            你的品牌
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
            全方位 GEO（Generative Engine Optimization）解決方案，
            <br className="hidden sm:block" />
            讓 ChatGPT、Claude、Perplexity 等 AI 工具主動推薦你。
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto">
            <Input
              placeholder="輸入您的網址，免費掃描..."
              value={scanUrl}
              onChange={(e) => setScanUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-blue-200 backdrop-blur-sm flex-1"
            />
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-8 shrink-0"
              onClick={handleScan}
              disabled={guestScan.isPending}
            >
              {guestScan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              免費掃描
              {!guestScan.isPending && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          </div>

          {guestScan.isError && (
            <p className="mt-4 text-sm text-red-300">
              {(guestScan.error as any)?.response?.data?.message ||
                '掃描請求失敗，請稍後再試'}
            </p>
          )}

          {!scanId && (
            <p className="mt-6 text-sm text-blue-200">
              無需註冊，每日可免費掃描 3 次
            </p>
          )}

          {scanId && <GuestScanResults scanId={scanId} />}
        </div>
      </section>

      {/* Platform Stats */}
      <PlatformStatsBar />

      {/* Crawler Marquee */}
      <CrawlerMarquee />

      {/* Features */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              為什麼選擇 Geovault？
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              從診斷到修復，從內容生成到多平台佈局，一站式解決所有 GEO 需求
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              選擇適合的方案
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              從免費方案開始，隨時升級
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'bg-white rounded-2xl p-6 border-2 transition-shadow hover:shadow-lg relative',
                  plan.popular
                    ? 'border-blue-600 ring-2 ring-blue-600/20'
                    : 'border-gray-100'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      推薦
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {plan.name}
                  </h3>
                  <div className="mt-3">
                    <span className="text-4xl font-bold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/register" className="w-full">
                  <Button
                    className={cn(
                      'w-full',
                      plan.popular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : ''
                    )}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">
            立即開始優化你的品牌 AI 可見度
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            免費開始，無需信用卡。3 分鐘完成首次掃描。
          </p>
          <Link href="/register" className="inline-block mt-8">
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-10"
            >
              免費開始
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              已被台灣品牌信賴
            </h2>
            <p className="mt-3 text-gray-600">
              超過 180 個台灣品牌已使用 Geovault 優化 AI 搜尋能見度
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl font-bold text-blue-600">180+</p>
              <p className="text-sm text-gray-500 mt-1">收錄品牌</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-green-600">500+</p>
              <p className="text-sm text-gray-500 mt-1">分析文章</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-purple-600">10</p>
              <p className="text-sm text-gray-500 mt-1">行業覆蓋</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-orange-600">8</p>
              <p className="text-sm text-gray-500 mt-1">AI 可讀性指標</p>
            </div>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link href="/directory" className="text-blue-600 hover:underline text-sm font-medium">
              瀏覽品牌目錄 →
            </Link>
            <Link href="/blog" className="text-blue-600 hover:underline text-sm font-medium">
              閱讀分析報告 →
            </Link>
            <Link href="/cases" className="text-blue-600 hover:underline text-sm font-medium">
              成功案例 →
            </Link>
            <Link href="/news" className="text-blue-600 hover:underline text-sm font-medium">
              AI News →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-white">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">
            &copy; 2024 Geovault. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
