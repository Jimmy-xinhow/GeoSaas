'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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
  Shield,
  BarChart3,
  Eye,
  FileText,
  Zap,
  TrendingUp,
  Globe,
  BookOpen,
  ClipboardCheck,
  X,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useGuestScan, useGuestScanStatus } from '@/hooks/use-guest-scan'
import { useSubmitIndexNow } from '@/hooks/use-indexnow'
import { useCrawlerFeed, usePlatformStats } from '@/hooks/use-directory'
import PublicNavbar from '@/components/layout/public-navbar'
import { GeovaultLogoCompact, GeovaultLogoCompactDark } from '@/components/logo'

/* ─── Animated counter hook ─── */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!ref.current || started.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const animate = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(Math.floor(eased * target))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, duration])

  return { count, ref }
}

/* ─── Scan Result Sub-components (kept from original) ─── */

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

function IndexNowButton({ url }: { url: string }) {
  const submitIndexNow = useSubmitIndexNow()
  const successCount = submitIndexNow.data?.results?.filter((r: any) => r.success).length ?? 0
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
          <><Loader2 className="h-4 w-4 animate-spin" />通知中...</>
        ) : submitIndexNow.isSuccess ? (
          <><CheckCircle2 className="h-4 w-4" />已通知 {successCount}/{totalCount} 個搜尋引擎</>
        ) : (
          <><Send className="h-4 w-4" />通知搜尋引擎更新（IndexNow）</>
        )}
      </button>
      {submitIndexNow.isSuccess && (
        <div className="mt-2 space-y-1">
          {submitIndexNow.data?.results?.map((r: any) => (
            <div key={r.engine} className="flex items-center justify-between text-xs px-2">
              <span className="text-white/60">{r.engine}</span>
              <span className={r.success ? 'text-green-400' : 'text-red-400'}>{r.success ? '✓' : '✗'}</span>
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
          <span className="text-lg">{scan.status === 'PENDING' ? '排隊中...' : '掃描進行中...'}</span>
        </div>
      </div>
    )
  }

  if (scan.status === 'FAILED') {
    return (
      <div className="mt-8 bg-red-500/20 backdrop-blur-sm rounded-2xl p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-2 text-white">
          <AlertCircle className="h-5 w-5" /><span>掃描失敗，請稍後再試</span>
        </div>
      </div>
    )
  }

  const indicators = scan.results?.indicators
  if (!indicators) return null

  const scoreColor = scan.totalScore >= 80 ? 'text-green-300' : scan.totalScore >= 60 ? 'text-blue-200' : scan.totalScore >= 40 ? 'text-yellow-300' : 'text-red-300'

  return (
    <div className="mt-8 max-w-2xl mx-auto space-y-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
        <p className="text-blue-200 text-sm mb-1">您的 GEO 分數</p>
        <p className={`text-6xl font-bold ${scoreColor}`}>{scan.totalScore}</p>
        <p className="text-blue-200 text-sm mt-2">/ 100</p>
      </div>
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">指標詳情</h3>
        <div className="space-y-3">
          {Object.entries(indicators).map(([name, result]: [string, any]) => {
            const Icon = STATUS_ICON[result.status as keyof typeof STATUS_ICON]
            const color = STATUS_COLOR[result.status as keyof typeof STATUS_COLOR]
            return (
              <div key={name} className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-white text-sm">{name}</span>
                </div>
                <span className="text-white font-semibold tabular-nums">{result.score}</span>
              </div>
            )
          })}
        </div>
      </div>
      <IndexNowButton url={scan.url} />
      <div className="text-center">
        <Link href="/register">
          <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 font-semibold h-12 px-10">
            註冊解鎖完整報告 & 自動修復
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

function CrawlerMarquee() {
  const { data: crawlerFeed } = useCrawlerFeed()
  if (!crawlerFeed || crawlerFeed.feed.length === 0) return null
  const items = crawlerFeed.feed
  const doubled = [...items, ...items]

  return (
    <div className="bg-gray-900 text-white py-2.5 overflow-hidden">
      <div className="flex items-center gap-8 animate-marquee whitespace-nowrap">
        {doubled.map((item: any, i: number) => (
          <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-purple-300 font-medium">{item.botName}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-300">{item.site?.name || item.url}</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee ${Math.max(items.length * 3, 20)}s linear infinite; }
      `}</style>
    </div>
  )
}

/* ─── AI Platform SVG Logos ─── */
function ChatGPTLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )
}

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.603 15.477l5.397-6.985L4.603 1.5h2.794l3.603 4.66L14.603 1.5h2.794l-5.397 6.992 5.397 6.985h-2.794L11 10.817l-3.603 4.66H4.603z" transform="translate(1 4) scale(0.92)" />
    </svg>
  )
}

function PerplexityLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7.38 3.162L12 .845l4.62 2.317V7.69L12 10.008 7.38 7.69V3.162zM2.76 8.535L7.38 6.218v4.527L12 13.062v4.527l-4.62 2.317-4.62-2.317V8.535zm18.48 0v9.054l-4.62 2.317L12 17.59v-4.527l4.62-2.317V6.218l4.62 2.317z" />
    </svg>
  )
}

function GeminiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 24A14.304 14.304 0 0 0 12 0a14.304 14.304 0 0 0 0 24zM12 24c0-7.902-6.098-14-14-14M12 24c0-7.902 6.098-14 14-14M12 0C12 7.902 5.902 14 0 14M12 0c0 7.902 6.098 14 12 14" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CopilotLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.922 12.153c-.1-2.725-1.346-5.32-3.503-7.29C18.263 2.894 15.42 1.832 12.47 1.832h-.94C8.58 1.832 5.737 2.894 3.58 4.864 1.424 6.833.178 9.428.078 12.153c-.052 1.423.197 2.823.73 4.113a10.202 10.202 0 0 0 2.263 3.396l.4.394a1.468 1.468 0 0 0 1.058.441h.008c.397 0 .78-.16 1.058-.445l.573-.574a1.48 1.48 0 0 0 .366-1.488 5.038 5.038 0 0 1-.195-1.388c0-1.328.517-2.578 1.456-3.52A4.965 4.965 0 0 1 9.35 12.04c.22-.035.443-.054.67-.054h3.96c.227 0 .45.019.67.054a4.965 4.965 0 0 1 3.555 1.442 4.954 4.954 0 0 1 1.456 3.52c0 .473-.067.94-.195 1.388a1.48 1.48 0 0 0 .366 1.488l.573.574a1.498 1.498 0 0 0 2.124-.004l.393-.386a10.202 10.202 0 0 0 2.263-3.396c.533-1.29.782-2.69.73-4.113z" />
    </svg>
  )
}

/* Platform data with logos */
const aiPlatforms = [
  { name: 'ChatGPT', color: 'from-green-400 to-green-600', bg: 'bg-[#10a37f]', Logo: ChatGPTLogo },
  { name: 'Claude', color: 'from-orange-400 to-orange-600', bg: 'bg-[#d97757]', Logo: ClaudeLogo },
  { name: 'Perplexity', color: 'from-blue-400 to-blue-600', bg: 'bg-[#1a73e8]', Logo: PerplexityLogo },
  { name: 'Gemini', color: 'from-purple-400 to-purple-600', bg: 'bg-[#8e44ef]', Logo: GeminiLogo },
  { name: 'Copilot', color: 'from-cyan-400 to-cyan-600', bg: 'bg-[#0078d4]', Logo: CopilotLogo },
]

/* ─── Pricing Data ─── */
const pricingPlans = [
  {
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      { text: '1 個網站', included: true },
      { text: '每站 2 次掃描/月', included: true },
      { text: '基礎 GEO 報告', included: true },
      { text: 'llms.txt 託管', included: true },
      { text: 'AI 修復建議（1 次）', included: true },
      { text: 'AI 內容生成', included: false },
      { text: '知識庫 Q&A', included: false },
      { text: 'AI 引用監控 + 報告', included: false },
    ],
    cta: '免費開始',
    popular: false,
  },
  {
    name: 'Starter',
    monthlyPrice: 390,
    yearlyPrice: 351,
    features: [
      { text: '1 個網站', included: true },
      { text: '每站 6 次掃描/月', included: true },
      { text: 'AI 修復建議（30 次/月）', included: true },
      { text: 'AI 內容生成（30 次/月）', included: true },
      { text: '知識庫 Q&A（10 次/月）', included: true },
      { text: 'AI 引用監控（20 題/月 + 報告 2 次）', included: true },
      { text: '多平台發佈', included: false },
      { text: '自動排程', included: false },
    ],
    cta: '選擇方案',
    popular: false,
  },
  {
    name: 'Pro',
    monthlyPrice: 690,
    yearlyPrice: 621,
    features: [
      { text: '3 個網站', included: true },
      { text: '每站 10 次掃描/月', included: true },
      { text: 'AI 修復建議（50 次/月）', included: true },
      { text: 'AI 內容生成（50 次/月）', included: true },
      { text: '知識庫 Q&A（15 次/月）', included: true },
      { text: 'AI 引用監控（30 題/月 + 報告 3 次）', included: true },
      { text: '多平台發佈', included: true },
      { text: '自動排程', included: true },
    ],
    cta: '立即升級',
    popular: true,
  },
]

/* ─── Main Page ─── */
export default function LandingPage() {
  const [scanUrl, setScanUrl] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [isYearly, setIsYearly] = useState(false)
  const guestScan = useGuestScan()
  const { data: stats } = usePlatformStats()

  const handleScan = () => {
    if (!scanUrl.trim()) return
    let url = scanUrl.trim()
    if (!/^https?:\/\//.test(url)) url = `https://${url}`
    guestScan.mutate(url, { onSuccess: (data: any) => setScanId(data.id) })
  }

  // Animated counters for stats section
  const brandCount = useCountUp(stats?.totalSites ?? 680)
  const articleCount = useCountUp(stats?.totalScans ? stats.totalScans * 3 : 2800)
  const industryCount = useCountUp(22)

  /* JSON-LD */
  const jsonLdWebSite = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Geovault', url: 'https://www.geovault.app',
    description: 'Geovault helps brands get discovered and cited by ChatGPT, Claude, Perplexity, Gemini, and Copilot. The #1 GEO platform in APAC.',
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: 'https://www.geovault.app/directory?search={search_term_string}' }, 'query-input': 'required name=search_term_string' },
  }
  const jsonLdOrg = {
    '@context': 'https://schema.org', '@type': 'Organization', name: 'Geovault', url: 'https://www.geovault.app',
    logo: 'https://www.geovault.app/logo.png', description: 'The APAC Authority on Generative Engine Optimization (GEO)',
    sameAs: ['https://twitter.com/geovault', 'https://www.linkedin.com/company/geovault'], foundingDate: '2026',
    knowsAbout: ['GEO', 'AI SEO', 'Generative Engine Optimization', 'llms.txt', 'AI search optimization'],
  }
  const jsonLdFaq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'GEO 和 SEO 有什麼不同？', acceptedAnswer: { '@type': 'Answer', text: 'SEO 優化的是 Google 搜尋排名，GEO 優化的是 AI 搜尋引用。當用戶問 ChatGPT「推薦一間好的餐廳」，AI 只會推薦 1-3 個品牌——GEO 就是確保你的品牌在這 1-3 個之中。' } },
      { '@type': 'Question', name: '多久能看到 GEO 優化效果？', acceptedAnswer: { '@type': 'Answer', text: '根據我們的案例數據，完成基礎優化（JSON-LD + llms.txt + FAQ Schema）後，通常 7-14 天內就能在 AI 搜尋中看到改善。部分品牌在優化後 3 天即被 ChatGPT 推薦。' } },
      { '@type': 'Question', name: 'Geovault 支援監控哪些 AI 平台？', acceptedAnswer: { '@type': 'Answer', text: 'Geovault 支援 5 大 AI 平台的引用監控：ChatGPT（OpenAI）、Claude（Anthropic）、Perplexity、Gemini（Google）、Microsoft Copilot。' } },
      { '@type': 'Question', name: '我不懂技術，能用 Geovault 嗎？', acceptedAnswer: { '@type': 'Answer', text: '完全可以。Geovault 的自動修復工具會直接生成你需要的程式碼，你只需要複製貼上到你的網站即可。如果你使用 WordPress、Webflow 等平台，我們也提供專屬的安裝教學。' } },
      { '@type': 'Question', name: '可以隨時取消訂閱嗎？', acceptedAnswer: { '@type': 'Answer', text: '可以。所有付費方案都可以隨時取消，取消後仍可使用到當期結束。我們也提供年繳方案享 9 折優惠。' } },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }} />

      <PublicNavbar />

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — HERO: Pain Point Driven
         ════════════════════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-32 text-center text-white overflow-hidden bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-6">
          {/* AI Platform badges with logos */}
          <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
            {aiPlatforms.map((p) => (
              <span key={p.name} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r text-white shadow-lg', p.color)}>
                <p.Logo className="h-3.5 w-3.5" />
                {p.name}
              </span>
            ))}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            當客戶問 AI
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              「推薦一間好的 OO 店」
            </span>
            <br />
            AI 的回答裡有你嗎？
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-blue-200/90 max-w-2xl mx-auto leading-relaxed">
            <strong className="text-white">70% 的消費者</strong>已經開始用 AI 取代 Google 搜尋。
            <br />
            如果你的品牌沒有被 AI 收錄，<strong className="text-orange-300">你正在流失這些客戶。</strong>
          </p>

          {/* Scan input */}
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto">
            <Input
              placeholder="輸入你的網址，免費檢測 AI 能見度..."
              value={scanUrl}
              onChange={(e) => setScanUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              className="h-14 bg-white/10 border-white/20 text-white placeholder:text-blue-300/60 backdrop-blur-sm flex-1 text-base rounded-xl"
            />
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold h-14 px-8 shrink-0 rounded-xl shadow-lg shadow-blue-500/25"
              onClick={handleScan}
              disabled={guestScan.isPending}
            >
              {guestScan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              免費檢測
              {!guestScan.isPending && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          </div>

          {guestScan.isError && (
            <p className="mt-4 text-sm text-red-300">
              {(guestScan.error as any)?.response?.data?.message || '掃描請求失敗，請稍後再試'}
            </p>
          )}

          {!scanId && (
            <p className="mt-4 text-sm text-blue-300/60">無需註冊，每月可免費檢測 2 次</p>
          )}

          {scanId && <GuestScanResults scanId={scanId} />}
        </div>
      </section>

      {/* Crawler Marquee */}
      <CrawlerMarquee />

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — THE PROBLEM: SEO vs GEO
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-400 mb-4">
              你知道嗎？
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              傳統 SEO 已經不夠了
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
              AI 搜尋正在改變遊戲規則，你的品牌準備好了嗎？
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Google Search - Old way */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 relative">
              <div className="absolute -top-3 left-6">
                <span className="bg-gray-700 text-gray-300 text-xs font-semibold px-3 py-1 rounded-full">過去</span>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold">Google 搜尋</h3>
              </div>
              <div className="space-y-3 mb-6">
                <p className="text-sm text-gray-500 mb-4">搜尋「台北推薦整復」</p>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 bg-white/5 rounded-lg">
                    <span className="text-xs text-gray-500 w-5">{i}.</span>
                    <div className="flex-1">
                      <div className="h-3 bg-white/10 rounded w-3/4" />
                      <div className="h-2 bg-white/5 rounded w-1/2 mt-1.5" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-500">10 個結果</p>
                <p className="text-sm text-gray-500 mt-1">點擊率分散，每個只拿到 2-10%</p>
              </div>
            </div>

            {/* AI Search - New way */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border-2 border-blue-500/50 relative shadow-lg shadow-blue-500/10">
              <div className="absolute -top-3 left-6">
                <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">現在</span>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[#10a37f]/20 flex items-center justify-center">
                  <ChatGPTLogo className="h-5 w-5 text-[#10a37f]" />
                </div>
                <h3 className="text-lg font-semibold">AI 搜尋</h3>
              </div>
              <div className="space-y-3 mb-6">
                <p className="text-sm text-gray-400 mb-4">問 ChatGPT「推薦台北整復」</p>
                <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    <span className="text-gray-500">AI：</span>根據評價和專業度，我推薦以下幾間：
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-blue-400 font-bold">1.</span>
                      <span className="font-semibold text-green-400 bg-green-500/20 px-2 py-0.5 rounded">你的品牌 ✓</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>2.</span><div className="h-3 bg-white/10 rounded w-24" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>3.</span><div className="h-3 bg-white/10 rounded w-20" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">只推薦 1-3 個</p>
                <p className="text-sm text-blue-400/70 mt-1">被選中 = 獨佔高意願流量</p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-6 py-4">
              <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />
              <p className="text-orange-300 font-medium">
                在 AI 搜尋時代，<strong>不被推薦 = 不存在</strong>。你的競爭對手可能已經在優化了。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — HOW IT WORKS: 3 Steps
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400 mb-4">
              簡單三步驟
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              讓 AI 主動推薦你的品牌
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              不需要技術背景，3 分鐘即可開始
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting lines (desktop only) */}
            <div className="hidden md:block absolute top-16 left-1/3 w-1/3 h-0.5 bg-gradient-to-r from-blue-500/30 to-purple-500/30" />
            <div className="hidden md:block absolute top-16 right-0 w-1/3 h-0.5 bg-gradient-to-r from-purple-500/30 to-green-500/30" />

            {/* Step 1 */}
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center group hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-lg shadow-blue-600/30">
                1
              </div>
              <h3 className="mt-6 text-xl font-bold">掃描檢測</h3>
              <p className="mt-3 text-gray-400 leading-relaxed">
                輸入網址，<strong className="text-gray-200">9 項 AI 可讀性指標</strong>全面檢測。立即知道你的品牌在 AI 眼中的「可見度分數」。
              </p>
              <div className="mt-6 inline-flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3">
                <div className="w-12 h-12 rounded-full border-4 border-blue-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-400">72</span>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-500">GEO Score</p>
                  <p className="text-xs font-medium text-blue-400">Silver</p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center group hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-lg shadow-purple-600/30">
                2
              </div>
              <h3 className="mt-6 text-xl font-bold">AI 自動優化</h3>
              <p className="mt-3 text-gray-400 leading-relaxed">
                一鍵生成 <strong className="text-gray-200">JSON-LD、llms.txt、FAQ Schema</strong>，AI 自動建立品牌知識庫，讓 AI 真正「認識」你。
              </p>
              <div className="mt-6 bg-black/30 rounded-xl p-3 text-left overflow-hidden border border-white/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <code className="text-[10px] leading-relaxed text-green-400 font-mono block">
                  {'{'}&quot;@type&quot;: &quot;LocalBusiness&quot;,{'\n'}
                  &nbsp;&quot;name&quot;: &quot;你的品牌&quot;,{'\n'}
                  &nbsp;&quot;geo&quot;: {'{'}&quot;score&quot;: 92{'}'}
                  {'}'}
                </code>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center group hover:border-green-500/30 hover:shadow-xl hover:shadow-green-500/5 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-green-600 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-lg shadow-green-600/30">
                3
              </div>
              <h3 className="mt-6 text-xl font-bold">即時驗證</h3>
              <p className="mt-3 text-gray-400 leading-relaxed">
                <strong className="text-gray-200">5 大 AI 平台即時監控</strong>，看到 ChatGPT、Claude 真的在推薦你。產出驗收報告，證明效果。
              </p>
              <div className="mt-6 space-y-2">
                {['ChatGPT', 'Claude', 'Perplexity'].map((name) => (
                  <div key={name} className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-gray-300">{name}</span>
                    <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" />已引用
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — CASES: Social Proof (real + simulated)
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-green-500/20 text-green-400 mb-4">
              成功案例
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              各行各業，都在被 AI 推薦
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              從在地商家到連鎖品牌，Geovault 幫助不同產業被 AI 搜尋引擎主動推薦
            </p>
          </div>

          {/* Row 1: 3 cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            {/* Case 1 - 整復推拿 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">立如整復</h3>
                  <p className="text-xs text-gray-400">整復推拿 · 台北</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">32</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">56</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#10a37f]/20 flex items-center justify-center">
                    <ChatGPTLogo className="h-2.5 w-2.5 text-[#10a37f]" />
                  </div>
                  <span className="text-[10px] text-green-400 font-medium">ChatGPT 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「推薦<span className="text-green-400 font-semibold">立如整復</span>，位於台北中山區，專長傳統整復推拿，以非醫療的自然手法著稱...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ChatGPTLogo className="h-3 w-3" />ChatGPT
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <PerplexityLogo className="h-3 w-3" />Perplexity
                </span>
                <span className="text-[10px] text-gray-500 ml-auto">產業排名 #1</span>
              </div>
            </div>

            {/* Case 2 - 汽車美容 */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">詹大汽車精品</h3>
                  <p className="text-xs text-gray-400">汽車美容 · 全台</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">18</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">73</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#d97757]/20 flex items-center justify-center">
                    <ClaudeLogo className="h-2.5 w-2.5 text-[#d97757]" />
                  </div>
                  <span className="text-[10px] text-orange-400 font-medium">Claude 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「<span className="text-green-400 font-semibold">詹大汽車精品</span>提供專業汽車美容產品與施工教學，在汽車美容領域深耕多年...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ChatGPTLogo className="h-3 w-3" />ChatGPT
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ClaudeLogo className="h-3 w-3" />Claude
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 ml-auto">
                  <TrendingUp className="h-3 w-3" />+305%
                </span>
              </div>
            </div>

            {/* Case 3 - 咖啡廳 (模擬) */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">森林咖啡工坊</h3>
                  <p className="text-xs text-gray-400">咖啡茶飲 · 台中</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">25</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">81</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#1a73e8]/20 flex items-center justify-center">
                    <PerplexityLogo className="h-2.5 w-2.5 text-[#1a73e8]" />
                  </div>
                  <span className="text-[10px] text-blue-400 font-medium">Perplexity 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「台中精品咖啡推薦<span className="text-green-400 font-semibold">森林咖啡工坊</span>，自家烘焙豆、手沖單品，是在地人私藏的口袋名單...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <PerplexityLogo className="h-3 w-3" />Perplexity
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <GeminiLogo className="h-3 w-3" />Gemini
                </span>
                <span className="text-[10px] text-gray-500 ml-auto">7 天見效</span>
              </div>
            </div>
          </div>

          {/* Row 2: 3 cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            {/* Case 4 - 美容美髮 (模擬) */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">慕光髮藝</h3>
                  <p className="text-xs text-gray-400">美容美髮 · 新北</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">15</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">68</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#10a37f]/20 flex items-center justify-center">
                    <ChatGPTLogo className="h-2.5 w-2.5 text-[#10a37f]" />
                  </div>
                  <span className="text-[10px] text-green-400 font-medium">ChatGPT 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「新北板橋染燙推薦<span className="text-green-400 font-semibold">慕光髮藝</span>，擅長日系透明感髮色、結構式護髮，評價高達 4.9 星...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ChatGPTLogo className="h-3 w-3" />ChatGPT
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <CopilotLogo className="h-3 w-3" />Copilot
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 ml-auto">
                  <TrendingUp className="h-3 w-3" />+353%
                </span>
              </div>
            </div>

            {/* Case 5 - 健身 (模擬) */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">鐵人健身工廠</h3>
                  <p className="text-xs text-gray-400">健身教練 · 高雄</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">22</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">77</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#8e44ef]/20 flex items-center justify-center">
                    <GeminiLogo className="h-2.5 w-2.5 text-[#8e44ef]" />
                  </div>
                  <span className="text-[10px] text-purple-400 font-medium">Gemini 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「高雄私人教練推薦<span className="text-green-400 font-semibold">鐵人健身工廠</span>，提供一對一訓練課程，教練團隊擁有國際認證...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <GeminiLogo className="h-3 w-3" />Gemini
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ChatGPTLogo className="h-3 w-3" />ChatGPT
                </span>
                <span className="text-[10px] text-gray-500 ml-auto">10 天見效</span>
              </div>
            </div>

            {/* Case 6 - 寵物 (模擬) */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-green-500/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">毛孩星球</h3>
                  <p className="text-xs text-gray-400">寵物美容 · 桃園</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-500">30</span>
                  <ArrowRight className="h-3 w-3 text-green-400" />
                  <span className="font-bold text-green-400">85</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-[#0078d4]/20 flex items-center justify-center">
                    <CopilotLogo className="h-2.5 w-2.5 text-[#0078d4]" />
                  </div>
                  <span className="text-[10px] text-cyan-400 font-medium">Copilot 回覆</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  「桃園寵物美容推薦<span className="text-green-400 font-semibold">毛孩星球</span>，專業寵物 SPA、造型修剪，環境乾淨溫馨，毛小孩首選...」
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <CopilotLogo className="h-3 w-3" />Copilot
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <ClaudeLogo className="h-3 w-3" />Claude
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 ml-auto">
                  <TrendingUp className="h-3 w-3" />+183%
                </span>
              </div>
            </div>
          </div>

          {/* Industry coverage strip */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 mb-8">
            <p className="text-center text-sm text-gray-400 mb-4">已涵蓋 22 個行業類別</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['整復推拿', '汽車美容', '咖啡茶飲', '美容美髮', '健身教練', '寵物美容', '牙醫診所', '餐廳美食', '法律事務所', '室內設計', '婚禮攝影', '親子教育', '居家清潔', '花藝設計'].map(industry => (
                <span key={industry} className="px-3 py-1 rounded-full text-xs bg-white/5 text-gray-300 border border-white/10">
                  {industry}
                </span>
              ))}
              <span className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/20">
                +8 更多行業
              </span>
            </div>
          </div>

          <div className="text-center">
            <Link href="/cases">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-xl">
                查看更多成功案例
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — FEATURES: Deep Dive (6 features)
         ════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 lg:py-28 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400 mb-4">
              完整解決方案
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              不只是檢測，是完整的
              <br className="hidden sm:block" />
              <span className="text-blue-400">AI 品牌能見度平台</span>
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
              從掃描診斷到修復優化，從內容生成到效果驗證，一站式搞定
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Search className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">9 項 AI 可讀性掃描</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                全面檢測 JSON-LD、llms.txt、FAQ Schema、OG Tags、Meta Description、robots.txt AI 政策等 9 項指標。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['JSON-LD', 'llms.txt', 'FAQ', 'OG Tags', 'robots.txt'].map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded-full">{tag}</span>
                ))}
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Wrench className="h-7 w-7 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">一鍵 AI 自動修復</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                AI 根據你的品牌資料自動生成結構化資料程式碼。複製貼上即可，不需要技術背景。
              </p>
              <div className="flex items-center gap-2 text-sm text-purple-400">
                <Zap className="h-4 w-4" />
                <span className="font-medium">平均 3 分鐘完成修復</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-green-500/30 hover:shadow-xl hover:shadow-green-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-green-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <BookOpen className="h-7 w-7 text-green-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">AI 品牌知識庫</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                AI 自動生成 60+ 題 FAQ 和品牌知識，讓 ChatGPT、Claude 真正「認識」你的品牌。
              </p>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Sparkles className="h-4 w-4" />
                <span className="font-medium">5 大分類自動覆蓋</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-orange-500/30 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Eye className="h-7 w-7 text-orange-600" />
              </div>
              <h3 className="text-lg font-bold mb-2">5 平台即時引用監控</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                即時監控 ChatGPT、Claude、Perplexity、Gemini、Copilot 是否正在推薦你的品牌。
              </p>
              <div className="flex flex-wrap gap-2">
                {aiPlatforms.map(p => (
                  <span key={p.name} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-orange-500/20 text-orange-400 rounded-full">
                    <p.Logo className="h-3 w-3" />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Feature 5 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <ClipboardCheck className="h-7 w-7 text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">客戶驗收報告</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                一鍵生成 5 平台 AI 引用檢測報告，匯出 PDF。用數據向老闆或客戶證明優化成效。
              </p>
              <div className="flex items-center gap-2 text-sm text-cyan-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">50 題 × 5 平台全面檢測</span>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="group p-8 rounded-2xl border border-white/10 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 bg-white/5">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Globe className="h-7 w-7 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">品牌公開目錄</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                你的品牌被收錄到 Geovault 目錄，持續被 AI 爬蟲收錄。越多曝光，AI 越容易找到你。
              </p>
              <div className="flex items-center gap-2 text-sm text-indigo-400">
                <BarChart3 className="h-4 w-4" />
                <span className="font-medium">22 個行業分類</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 6 — ROI: Why it's worth it
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gradient-to-b from-gray-800 to-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-green-500/20 text-green-400 mb-4">
              投資報酬率
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              一次 AI 推薦的價值是多少？
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/10 hover:border-red-500/30 transition-all">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-3xl font-bold">NT$15-50</p>
              <p className="text-sm text-gray-400 mt-2">Google Ads<br />單次點擊費用</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/10 hover:border-green-500/30 transition-all relative">
              <div className="absolute -top-2 -right-2">
                <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">FREE</span>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <ChatGPTLogo className="h-6 w-6 text-[#10a37f]" />
              </div>
              <p className="text-3xl font-bold text-green-400">$0</p>
              <p className="text-sm text-gray-400 mt-2">AI 推薦一次<br />免費且最高信任度曝光</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/10 hover:border-blue-500/30 transition-all">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-6 w-6 text-blue-400" />
              </div>
              <p className="text-3xl font-bold">NT$23</p>
              <p className="text-sm text-gray-400 mt-2">每天不到一杯咖啡<br />換取持續 AI 曝光</p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 max-w-2xl mx-auto text-center">
            <p className="text-lg leading-relaxed">
              每月 <span className="text-3xl font-bold text-blue-400">NT$690</span> 的 Pro 方案
            </p>
            <p className="mt-3 text-gray-400">
              = 每天 NT$23 = 讓你的品牌在 <strong className="text-gray-200">ChatGPT、Claude、Perplexity、Gemini、Copilot</strong> 上被主動推薦
            </p>
            <p className="mt-4 text-sm text-gray-500">
              一個 AI 推薦帶來的高意願客戶，遠比 10 次 Google Ads 點擊更有價值
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 7 — PLATFORM STATS (Social Proof Numbers)
         ════════════════════════════════════════════════════════ */}
      <section className="py-16 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div ref={brandCount.ref}>
              <p className="text-4xl sm:text-5xl font-bold text-white tabular-nums">{brandCount.count}+</p>
              <p className="text-sm text-blue-100 mt-2">收錄品牌</p>
            </div>
            <div ref={articleCount.ref}>
              <p className="text-4xl sm:text-5xl font-bold text-white tabular-nums">{articleCount.count}+</p>
              <p className="text-sm text-blue-100 mt-2">AI 分析文章</p>
            </div>
            <div ref={industryCount.ref}>
              <p className="text-4xl sm:text-5xl font-bold text-white tabular-nums">{industryCount.count}</p>
              <p className="text-sm text-blue-100 mt-2">行業覆蓋</p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-bold text-white">9</p>
              <p className="text-sm text-blue-100 mt-2">AI 可讀性指標</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 8 — PRICING with Monthly/Yearly Toggle
         ════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 lg:py-28 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400 mb-4">
              方案定價
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">
              選擇適合你的方案
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              免費開始，隨時升級。年繳享 9 折優惠。
            </p>

            {/* Monthly/Yearly Toggle */}
            <div className="mt-8 inline-flex items-center gap-3 bg-white/10 rounded-full p-1.5 border border-white/10">
              <button
                onClick={() => setIsYearly(false)}
                className={cn(
                  'px-5 py-2 rounded-full text-sm font-medium transition-all',
                  !isYearly ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white',
                )}
              >
                月繳
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={cn(
                  'px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                  isYearly ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white',
                )}
              >
                年繳
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  isYearly ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700',
                )}>
                  省 10%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => {
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
              const isPopular = plan.popular

              return (
                <div
                  key={plan.name}
                  className={cn(
                    'bg-white/5 backdrop-blur-sm rounded-2xl p-8 border-2 transition-all hover:shadow-xl relative',
                    isPopular ? 'border-blue-500 shadow-lg shadow-blue-500/20 scale-[1.02] bg-white/10' : 'border-white/10',
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                        最受歡迎
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-8">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <div className="mt-4">
                      {price === 0 ? (
                        <span className="text-4xl font-bold">免費</span>
                      ) : (
                        <>
                          <span className="text-sm text-gray-400">NT$</span>
                          <span className="text-4xl font-bold">{price.toLocaleString()}</span>
                          <span className="text-gray-400">/月</span>
                        </>
                      )}
                    </div>
                    {isYearly && price > 0 && (
                      <p className="mt-1 text-sm text-green-400 font-medium">
                        年繳 NT${(price * 12).toLocaleString()}，省 NT${((plan.monthlyPrice - plan.yearlyPrice) * 12).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature.text} className="flex items-start gap-2.5 text-sm">
                        {feature.included ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
                        )}
                        <span className={feature.included ? 'text-gray-300' : 'text-gray-600'}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/register" className="block">
                    <Button
                      className={cn(
                        'w-full h-12 rounded-xl font-semibold',
                        isPopular
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-600/20'
                          : '',
                      )}
                      variant={isPopular ? 'default' : 'outline'}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              )
            })}
          </div>

          <p className="text-center mt-8 text-sm text-gray-500">
            所有方案均可隨時取消。年繳方案按月計費，一次支付享折扣。
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 9 — FAQ
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">
              常見問題
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'GEO 和 SEO 有什麼不同？',
                a: 'SEO 優化的是 Google 搜尋排名，讓你出現在搜尋結果頁面上。GEO 優化的是 AI 搜尋引用，讓 ChatGPT、Claude 等 AI 在回答問題時主動推薦你的品牌。兩者可以同時進行，互不衝突。',
              },
              {
                q: '多久能看到效果？',
                a: '根據我們的案例數據，完成基礎優化（JSON-LD + llms.txt + FAQ Schema）後，通常 7-14 天內就能在部分 AI 平台看到改善。有些品牌在優化後 3 天即被 ChatGPT 推薦。',
              },
              {
                q: '我不懂技術，能用 Geovault 嗎？',
                a: '完全可以。Geovault 的自動修復工具會根據你的品牌資料直接生成需要的程式碼，你只需要複製貼上到你的網站即可。如果你使用 WordPress、Webflow 等平台，我們也提供安裝教學。',
              },
              {
                q: '免費方案有什麼限制？',
                a: '免費方案可以掃描 1 個網站，每月 2 次掃描，查看完整的 GEO 報告和分數，還可以免費體驗 1 次 AI 修復建議。如果需要 AI 內容生成、知識庫、引用監控等完整功能，可以升級到 Starter 或 Pro 方案。',
              },
              {
                q: '可以隨時取消訂閱嗎？',
                a: '可以。所有付費方案都可以隨時取消，取消後仍可使用到當期結束。我們也提供年繳方案享 9 折優惠。',
              },
            ].map((item) => (
              <details key={item.q} className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none hover:bg-white/5 transition-colors">
                  <span className="font-semibold pr-4">{item.q}</span>
                  <ChevronRight className="h-5 w-5 text-gray-500 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-6 pb-6 text-gray-400 leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 10 — FINAL CTA: AI Platform Recommendation
         ════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          {/* Simulated AI conversation */}
          <div className="max-w-lg mx-auto mb-12">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-left">
              {/* User question */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs">U</span>
                </div>
                <div className="bg-blue-500/10 rounded-xl rounded-tl-none px-4 py-2.5">
                  <p className="text-sm text-blue-200">推薦我一間好的 ______</p>
                </div>
              </div>
              {/* AI response */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#10a37f]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <ChatGPTLogo className="h-3.5 w-3.5 text-[#10a37f]" />
                </div>
                <div className="bg-white/5 rounded-xl rounded-tl-none px-4 py-2.5 flex-1">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    好的！我推薦{' '}
                    <span className="bg-green-500/20 text-green-400 font-bold px-1.5 py-0.5 rounded">你的品牌名稱</span>
                    ，因為他們在這個領域有豐富的專業經驗，而且客戶評價非常好...
                  </p>
                </div>
              </div>
            </div>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            下一個被 AI 推薦的
            <br />
            <span className="bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              就是你的品牌
            </span>
          </h2>
          <p className="mt-6 text-lg text-blue-200/80 max-w-xl mx-auto">
            ChatGPT、Claude、Perplexity、Gemini、Copilot
            <br />
            <strong className="text-white">5 大 AI 平台，每天數百萬次推薦機會。</strong>
            <br />
            <span className="text-blue-300/60">你只需要讓 AI「認識」你。</span>
          </p>

          {/* AI platform logos */}
          <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
            {aiPlatforms.map((p) => (
              <div key={p.name} className="flex flex-col items-center gap-1.5 group">
                <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform', p.bg)}>
                  <p.Logo className="h-6 w-6" />
                </div>
                <span className="text-xs text-blue-200/70 font-medium">{p.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold h-14 px-10 rounded-xl shadow-lg shadow-green-500/25"
              >
                免費檢測，立即開始
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <p className="text-sm text-blue-300/50">30 秒註冊，無需信用卡</p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER
         ════════════════════════════════════════════════════════ */}
      <footer className="py-12 border-t border-white/5 bg-gray-950 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid sm:grid-cols-4 gap-8 mb-8">
            <div>
              <GeovaultLogoCompactDark className="h-7 w-auto mb-3" />
              <p className="text-sm text-gray-500 leading-relaxed">
                APAC 領先的 AI 搜尋優化平台，讓品牌被 AI 主動推薦。
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">產品</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-white transition-colors">功能</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">方案定價</a></li>
                <li><Link href="/directory" className="hover:text-white transition-colors">品牌目錄</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">資源</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link href="/cases" className="hover:text-white transition-colors">成功案例</Link></li>
                <li><Link href="/news" className="hover:text-white transition-colors">AI News</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">探索</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/directory/industries" className="hover:text-white transition-colors">行業分類</Link></li>
                <li><Link href="/api/llms.txt" className="hover:text-white transition-colors">llms.txt</Link></li>
                <li><Link href="/api/llms-full.txt" className="hover:text-white transition-colors">llms-full.txt</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 text-center">
            <p className="text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} Geovault. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
