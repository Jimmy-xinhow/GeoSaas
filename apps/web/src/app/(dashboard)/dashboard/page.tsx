'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Globe,
  Loader2,
  MessageSquareQuote,
  PlusCircle,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useContents } from '@/hooks/use-content'
import { useClientDailyStats } from '@/hooks/use-client-reports'
import { useMonitorDashboard } from '@/hooks/use-monitor'
import { useScoreTrend, useTriggerScan } from '@/hooks/use-scan'
import { useCreateSite, useSites } from '@/hooks/use-sites'
import { clearPendingGuestScan, loadPendingGuestScan } from '@/lib/pending-guest-scan'
import { cn } from '@/lib/utils'

type ScoreTone = 'excellent' | 'good' | 'warning' | 'danger'

function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'warning'
  return 'danger'
}

function getScoreStatus(score: number): string {
  const tone = getScoreTone(score)
  if (tone === 'excellent') return '優秀'
  if (tone === 'good') return '良好'
  if (tone === 'warning') return '需改善'
  return '待補強'
}

const scoreToneClass: Record<ScoreTone, string> = {
  excellent: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  good: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  danger: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}

const scoreBarClass: Record<ScoreTone, string> = {
  excellent: 'bg-emerald-400',
  good: 'bg-sky-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return '剛剛'
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  return `${diffDays} 天前`
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score || 0)))
}

function normalizeSiteUrlInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function getSiteNameFromUrl(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/8">
        <Icon className="h-4 w-4 text-blue-200" />
      </div>
      <div>
        <CardTitle className="text-lg font-bold leading-tight text-white">{title}</CardTitle>
        {description && (
          <CardDescription className="mt-1 text-sm leading-relaxed text-slate-400">
            {description}
          </CardDescription>
        )}
      </div>
    </div>
  )
}

function StatusChip({ score }: { score: number }) {
  const tone = getScoreTone(score)
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold',
        scoreToneClass[tone],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', scoreBarClass[tone])} />
      {getScoreStatus(score)}
    </span>
  )
}

function StatCardSkeleton() {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-14" />
          </div>
          <Skeleton className="h-11 w-11 rounded-lg" />
        </div>
        <Skeleton className="mt-5 h-2 w-full rounded-full" />
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

type OnboardingStep = {
  key: string
  title: string
  description: string
  href: string
  cta: string
  done: boolean
  icon: typeof Activity
}

function getSiteScore(site: any): number {
  return clampScore(
    site?.overallScore ??
      site?.score ??
      site?.geoScore ??
      site?.latestScan?.geoScore ??
      site?.latestScan?.score ??
      site?.scans?.[0]?.geoScore ??
      site?.scans?.[0]?.score ??
      0,
  )
}

function hasCompletedScan(site: any): boolean {
  const scans = Array.isArray(site?.scans) ? site.scans : []
  return (
    scans.some((scan: any) => scan.status === 'COMPLETED' || scan.geoScore || scan.score) ||
    Boolean(site?.latestScan) ||
    getSiteScore(site) > 0
  )
}

function getPrimarySite(sites: any[]): any | null {
  if (sites.length === 0) return null
  return (
    sites.find((site) => hasCompletedScan(site)) ??
    sites.find((site) => site?.isClient) ??
    sites[0]
  )
}

function buildOnboardingSteps({
  sites,
  contents,
  monitorQueriesCount,
}: {
  sites: any[] | undefined
  contents: any[] | undefined
  monitorQueriesCount: number
}): OnboardingStep[] {
  const siteList = sites ?? []
  const primarySite = getPrimarySite(siteList)
  const hasSite = siteList.length > 0
  const hasScan = siteList.some((site) => hasCompletedScan(site))
  const bestScore = siteList.reduce((max, site) => Math.max(max, getSiteScore(site)), 0)
  const repairReady = hasScan && bestScore >= 80
  const hasContentEngine = (contents?.length ?? 0) > 0
  const hasMonitor = monitorQueriesCount > 0
  const siteHref = primarySite?.id ? `/sites/${primarySite.id}` : '/sites'

  return [
    {
      key: 'registered',
      title: '完成註冊',
      description: '帳號已建立，可以開始把網站接進 Geovault。',
      href: '/dashboard',
      cta: '查看總覽',
      done: true,
      icon: CheckCircle2,
    },
    {
      key: 'sites',
      title: '進入我的網站',
      description: '先到網站列表，確認要追蹤與優化的品牌網站。',
      href: '/sites',
      cta: '前往我的網站',
      done: hasSite,
      icon: Globe,
    },
    {
      key: 'create-site',
      title: '建立網站',
      description: '新增網站網址，系統才能保存掃描、修復與追蹤資料。',
      href: hasSite ? siteHref : '/sites/new',
      cta: hasSite ? '查看網站' : '建立第一個網站',
      done: hasSite,
      icon: PlusCircle,
    },
    {
      key: 'scan',
      title: '完成第一次掃描',
      description: '取得 GEO 分數、缺失項目與可修復的結構清單。',
      href: hasSite ? siteHref : '/sites/new',
      cta: hasSite ? '開始掃描' : '先建立網站',
      done: hasScan,
      icon: Search,
    },
    {
      key: 'fix',
      title: '導引修復',
      description: '依照系統建議修復 JSON-LD、FAQ、OG/Meta、llms.txt 等項目。',
      href: primarySite?.id ? `/sites/${primarySite.id}/guided-fix` : '/sites',
      cta: '開啟導引修復',
      done: repairReady,
      icon: Wrench,
    },
    {
      key: 'content',
      title: '建立內容引擎',
      description: '補齊品牌定位、服務、問答與 llms.txt，讓 AI 有可引用內容。',
      href: '/content',
      cta: '建立內容引擎',
      done: hasContentEngine,
      icon: FileText,
    },
    {
      key: 'monitor',
      title: '啟用 AI 監控',
      description: '設定追蹤問題，觀察 ChatGPT、Gemini 等平台是否引用品牌。',
      href: '/monitor',
      cta: '設定 AI 監控',
      done: hasMonitor,
      icon: Eye,
    },
    {
      key: 'report',
      title: '查看驗收報告',
      description: '完成修復與監控後，用報告確認分數、引用與後續待辦。',
      href: '/monitor/reports',
      cta: '查看驗收報告',
      done: false,
      icon: ClipboardCheck,
    },
  ]
}

function OnboardingGuide({
  sites,
  contents,
  monitorQueriesCount,
  isLoading,
}: {
  sites: any[] | undefined
  contents: any[] | undefined
  monitorQueriesCount: number
  isLoading: boolean
}) {
  const steps = useMemo(
    () => buildOnboardingSteps({ sites, contents, monitorQueriesCount }),
    [sites, contents, monitorQueriesCount],
  )
  const currentStep = steps.find((step) => !step.done) ?? steps[steps.length - 1]
  const completedCount = steps.filter((step) => step.done).length
  const progress = Math.round((completedCount / steps.length) * 100)
  const CurrentIcon = currentStep.icon

  if (isLoading) {
    return (
      <Card className="border-white/10 bg-white/5">
        <CardContent className="p-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-4 h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-blue-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_30%),rgba(15,23,42,0.82)]">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.35fr]">
        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-blue-100">新手成功路徑</p>
            <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2.5 py-1 text-xs font-semibold text-blue-100">
              {completedCount}/{steps.length}
            </span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/18 text-blue-100">
              <CurrentIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-400">下一步</p>
              <h2 className="mt-1 text-xl font-bold text-white">{currentStep.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {currentStep.description}
              </p>
            </div>
          </div>
          <Link
            href={currentStep.href}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {currentStep.cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isCurrent = step.key === currentStep.key
            const isLocked = !step.done && !isCurrent
            const content = (
              <div
                className={cn(
                  'min-h-[112px] rounded-xl border p-3 transition-colors',
                  step.done && 'border-emerald-400/25 bg-emerald-400/10',
                  isCurrent && 'border-blue-300/55 bg-blue-500/14',
                  isLocked && 'border-white/10 bg-slate-950/30 opacity-60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg',
                      step.done ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/8 text-blue-200',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-500">Step {index + 1}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-white">{step.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                  {step.description}
                </p>
              </div>
            )

            if (isLocked) return <div key={step.key}>{content}</div>
            return (
              <Link key={step.key} href={step.href} className="block">
                {content}
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const pendingRegistrationScanHandled = useRef(false)

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useSites()
  const { data: contents, isLoading: contentsLoading } = useContents()
  const { data: monitorData, isLoading: monitorLoading } = useMonitorDashboard()
  const createSiteMutation = useCreateSite()
  const triggerScanMutation = useTriggerScan()

  if (sitesError) {
    toast.error('無法載入網站資料', { id: 'sites-error' })
  }

  const stats = useMemo(() => {
    const sitesCount = sites?.length ?? 0
    const avgScore =
      sites && sites.length > 0
        ? Math.round(
            sites.reduce(
              (sum: number, s: any) => sum + (s.overallScore ?? s.score ?? 0),
              0,
            ) / sites.length,
          )
        : 0
    const citationCount = monitorData?.queries
      ? monitorData.queries.filter((q: any) => q.cited).length
      : 0
    const contentCount = contents?.length ?? 0

    return [
      {
        label: '監控品牌',
        value: String(sitesCount),
        hint: '已加入追蹤',
        icon: Globe,
        accent: 'from-blue-400 to-cyan-300',
        progress: Math.min(100, sitesCount * 18),
      },
      {
        label: '平均 GEO 分數',
        value: String(avgScore),
        hint: getScoreStatus(avgScore),
        icon: TrendingUp,
        accent: 'from-emerald-400 to-lime-300',
        progress: clampScore(avgScore),
      },
      {
        label: 'AI 引用命中',
        value: String(citationCount),
        hint: '本期監測',
        icon: MessageSquareQuote,
        accent: 'from-violet-400 to-fuchsia-300',
        progress: Math.min(100, citationCount * 12),
      },
      {
        label: '內容資產',
        value: String(contentCount),
        hint: '已建立素材',
        icon: FileText,
        accent: 'from-amber-300 to-orange-400',
        progress: Math.min(100, contentCount * 10),
      },
    ]
  }, [sites, contents, monitorData])

  const recentScans = useMemo(() => {
    if (!sites || sites.length === 0) return []
    return [...sites]
      .sort(
        (a: any, b: any) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 5)
      .map((site: any) => {
        const score = clampScore(site.overallScore ?? site.score ?? 0)
        return {
          name: site.name || site.url,
          url: site.url,
          score,
          time: formatTimeAgo(site.updatedAt),
        }
      })
  }, [sites])

  const { data: scoreTrend } = useScoreTrend()
  const trendData = useMemo(() => {
    if (!scoreTrend || scoreTrend.length === 0) return []
    return scoreTrend.map((t) => ({
      month: new Date(t.date).toLocaleDateString('zh-TW', {
        month: 'short',
        day: 'numeric',
      }),
      score: clampScore(t.score),
    }))
  }, [scoreTrend])

  const handleQuickScan = async () => {
    if (!url.trim()) {
      toast.error('請輸入網站網址')
      return
    }

    try {
      const site = await createSiteMutation.mutateAsync({
        url: url.trim(),
        name: url.trim(),
      })
      await triggerScanMutation.mutateAsync(site.id)
      toast.success('已建立網站並開始掃描')
      setUrl('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '掃描失敗，請稍後再試')
    }
  }

  const isScanning = createSiteMutation.isPending || triggerScanMutation.isPending
  const isLoading = sitesLoading || contentsLoading || monitorLoading

  useEffect(() => {
    if (pendingRegistrationScanHandled.current || sitesLoading) return
    const pending = loadPendingGuestScan()
    if (!pending?.url) return
    const pendingScan = pending

    pendingRegistrationScanHandled.current = true
    const normalizedUrl = normalizeSiteUrlInput(pendingScan.url)
    const existingSite = (sites as any[] | undefined)?.find(
      (site) => normalizeSiteUrlInput(site.url) === normalizedUrl,
    )

    async function startRegisteredScan() {
      try {
        const site = existingSite
          ? existingSite
          : await createSiteMutation.mutateAsync({
              url: normalizedUrl,
              name: getSiteNameFromUrl(normalizedUrl),
              ...(pendingScan.id ? { guestScanId: pendingScan.id } : {}),
            })

        const latestScan = site?.scans?.[0]
        const hasActiveScan =
          latestScan?.status === 'PENDING' || latestScan?.status === 'RUNNING'
        if (!pendingScan.id && !hasActiveScan) {
          await triggerScanMutation.mutateAsync(site.id)
        }

        clearPendingGuestScan()
        toast.success(pendingScan.id ? '已帶入免費掃描結果' : '已建立網站並開始第一次免費掃描')
        router.push(`/sites/${site.id}`)
      } catch (err: any) {
        toast.error(err?.response?.data?.message || '無法自動啟動掃描，請到「我的網站」手動新增')
      }
    }

    startRegisteredScan()
  }, [createSiteMutation, router, sites, sitesLoading, triggerScanMutation])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),rgba(255,255,255,0.04)] p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">
            <Sparkles className="h-3.5 w-3.5" />
            AI 搜尋可見度工作台
          </div>
          <h1 className="text-2xl font-bold tracking-normal text-white sm:text-3xl">
            Dashboard 總覽
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            集中查看品牌 GEO 分數、AI 引用、內容資產與近期掃描狀態。
          </p>
        </div>
        <Link
          href="/monitor/reports"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-blue-400/30 bg-blue-500/15 px-4 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-500/25"
        >
          查看成效報告
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <OnboardingGuide
        sites={sites as any[] | undefined}
        contents={contents as any[] | undefined}
        monitorQueriesCount={monitorData?.queries?.length ?? 0}
        isLoading={isLoading}
      />

      <PublishedContentBanner sites={sites as any[]} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          : stats.map((stat) => (
              <Card key={stat.label} className="overflow-hidden border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-300">{stat.label}</p>
                      <div className="mt-2 flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-white">{stat.value}</p>
                        <span className="text-xs font-medium text-slate-500">{stat.hint}</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg',
                        stat.accent,
                      )}
                    >
                      <stat.icon className="h-5 w-5 text-slate-950" />
                    </div>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/8">
                    <div
                      className={cn('h-full rounded-full bg-gradient-to-r', stat.accent)}
                      style={{ width: `${stat.progress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="pb-4">
          <SectionTitle
            icon={Search}
            title="快速新增掃描"
            description="輸入品牌官網網址，立即建立網站並產生 GEO 掃描任務。"
          />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickScan()}
              disabled={isScanning}
              className="h-11 flex-1 border-white/10 bg-slate-950/60"
            />
            <Button
              className="h-11 min-w-[128px] bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleQuickScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  掃描中
                </>
              ) : (
                <>
                  開始掃描
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-white/10 bg-white/5">
          <CardHeader className="pb-4">
            <SectionTitle
              icon={Activity}
              title="近期掃描狀態"
              description="用進度條快速判斷哪些品牌需要優先補強。"
            />
          </CardHeader>
          <CardContent>
            {sitesLoading ? (
              <TableSkeleton />
            ) : recentScans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 py-10 text-center">
                <Globe className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <p className="font-semibold text-white">尚未建立網站</p>
                <p className="mt-1 text-sm text-slate-500">先新增一個品牌官網開始追蹤。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentScans.map((scan) => {
                  const tone = getScoreTone(scan.score)
                  return (
                    <div
                      key={`${scan.name}-${scan.time}`}
                      className="rounded-xl border border-white/10 bg-slate-950/35 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {scan.name}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">{scan.url}</p>
                        </div>
                        <StatusChip score={scan.score} />
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <span className="w-10 text-right text-lg font-bold text-white">
                          {scan.score}
                        </span>
                        <div className="h-2 flex-1 rounded-full bg-white/8">
                          <div
                            className={cn('h-full rounded-full', scoreBarClass[tone])}
                            style={{ width: `${scan.score}%` }}
                          />
                        </div>
                        <span className="w-16 text-right text-xs text-slate-500">
                          {scan.time}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader className="pb-4">
            <SectionTitle
              icon={BarChart3}
              title="GEO 分數趨勢"
              description="追蹤分數變化，判斷優化後是否穩定提升。"
            />
          </CardHeader>
          <CardContent>
            {sitesLoading ? (
              <div className="h-[300px]">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
            ) : trendData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-white/15 text-center">
                <div>
                  <BarChart3 className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                  <p className="font-semibold text-white">尚無趨勢資料</p>
                  <p className="mt-1 text-sm text-slate-500">完成多次掃描後會顯示走勢。</p>
                </div>
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ left: -16, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="dashboardScoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                      domain={[0, 100]}
                      tick={{ fill: '#94a3b8' }}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10,
                        color: '#fff',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#38bdf8"
                      strokeWidth={3}
                      fill="url(#dashboardScoreGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="pb-4">
          <SectionTitle
            icon={ClipboardList}
            title="本月優化待辦"
            description="把例行工作改成可掃描的任務卡，降低後台閱讀負擔。"
          />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: '重新掃描品牌分數',
                desc: '確認近期網站調整是否反映在 GEO 指標。',
                href: '/sites',
                frequency: '每月 1-2 次',
                icon: Activity,
              },
              {
                label: '補齊品牌 Q&A',
                desc: '增加 AI 更容易引用的問答與服務說明。',
                href: '/sites',
                frequency: '每月 1 次',
                icon: MessageSquareQuote,
              },
              {
                label: '檢查內容資產',
                desc: '確認已發布內容是否覆蓋核心服務與地區。',
                href: '/content',
                frequency: '每月 2-3 篇',
                icon: FileText,
              },
              {
                label: '追蹤 AI 引用',
                desc: '查看品牌是否出現在 ChatGPT、Gemini 等回答。',
                href: '/monitor',
                frequency: '每月 1-2 次',
                icon: Search,
              },
              {
                label: '檢查品牌擴散',
                desc: '整理外部可見訊號，避免 AI 資料不足。',
                href: '/brand-spread',
                frequency: '每 1-2 週',
                icon: Sparkles,
              },
              {
                label: '匯出成效報告',
                desc: '用月報檢查分數、引用與內容資產變化。',
                href: '/monitor/reports',
                frequency: '每月 1 次',
                icon: BarChart3,
              },
            ].map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="group flex min-h-[116px] items-start gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-4 transition-colors hover:border-blue-400/35 hover:bg-blue-400/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/8 text-blue-200 transition-colors group-hover:bg-blue-400/20">
                  <task.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-white group-hover:text-blue-100">
                      {task.label}
                    </p>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 group-hover:text-blue-300" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{task.desc}</p>
                  <p className="mt-3 inline-flex h-6 items-center rounded-full border border-white/10 px-2 text-[11px] font-semibold text-slate-400">
                    {task.frequency}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PublishedContentBanner({ sites }: { sites: any[] | undefined }) {
  const firstClientSite = useMemo(() => {
    if (!sites || sites.length === 0) return null
    return sites.find((s) => s.isClient) ?? null
  }, [sites])

  const { data: stats } = useClientDailyStats(firstClientSite?.id ?? '')

  if (!firstClientSite || !stats) return null
  if (stats.activeDaysPerWeek === 0 && stats.totalCount === 0) return null

  return (
    <Link href="/published-content" className="block group">
      <Card className="overflow-hidden border-blue-400/20 bg-gradient-to-r from-blue-500/12 via-cyan-500/8 to-emerald-500/10 transition-colors hover:border-blue-300/45">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-400/18">
                <FileText className="h-6 w-6 text-blue-200" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-white">GEOvault 代發布內容資產</p>
                  <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-2 py-0.5 text-[11px] font-semibold text-blue-100">
                    {stats.plan}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {firstClientSite.name} 目前每週發布 {stats.activeDaysPerWeek} 天，持續補強 AI 可引用內容。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
              {[
                { label: '本月', value: stats.monthCount, className: 'text-emerald-300' },
                { label: '本週', value: stats.weekCount, className: 'text-blue-200' },
                { label: '累計', value: stats.totalCount, className: 'text-white' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-center">
                  <p className={cn('text-2xl font-bold', item.className)}>{item.value}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
