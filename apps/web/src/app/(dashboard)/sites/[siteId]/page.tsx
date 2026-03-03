'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  RefreshCw,
  Wrench,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
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
import { ScoreGauge } from '@/components/scan/score-gauge'
import { IndicatorCard } from '@/components/scan/indicator-card'
import ScanHistoryChart from '@/components/scan/scan-history-chart'
import { CodeSnippetViewer } from '@/components/fix/code-snippet-viewer'
import { useSite } from '@/hooks/use-sites'
import {
  useTriggerScan,
  useScanHistory,
  useScanResults,
  type Scan,
  type ScanResultItem,
} from '@/hooks/use-scan'
import {
  useGenerateJsonLd,
  useGenerateLlmsTxt,
  useGenerateOgTags,
  useGenerateFaqSchema,
  type FixGenerateResponse,
} from '@/hooks/use-fix'

// ── Indicator display name mapping ──
const indicatorNames: Record<string, string> = {
  'json-ld': '結構化資料 (JSON-LD)',
  'llms-txt': 'llms.txt',
  'og-tags': 'Open Graph 標籤',
  'meta-description': 'Meta 描述',
  'faq-schema': 'FAQ Schema',
  'title-optimization': '標題最佳化',
  'contact-info': '聯絡資訊',
  'image-alt': '圖片 Alt 文字',
}

// ── Which indicators can generate fixes ──
const fixableIndicators = new Set([
  'json-ld',
  'llms-txt',
  'og-tags',
  'faq-schema',
])

// ── Status icon helper ──
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return null
  }
}

// ── Scan status badge helper ──
function ScanStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: { label: '排隊中', className: 'bg-gray-100 text-gray-600' },
    RUNNING: { label: '掃描中', className: 'bg-blue-100 text-blue-600' },
    COMPLETED: { label: '已完成', className: 'bg-green-100 text-green-600' },
    FAILED: { label: '失敗', className: 'bg-red-100 text-red-600' },
  }
  const c = config[status] || config.PENDING
  return <Badge className={c.className}>{c.label}</Badge>
}

// ── Generate Fix Button (per indicator) ──
function GenerateFixButton({
  indicator,
  site,
  onGenerated,
}: {
  indicator: ScanResultItem
  site: { name: string; url: string }
  onGenerated: (code: string, language: string) => void
}) {
  const genJsonLd = useGenerateJsonLd()
  const genLlmsTxt = useGenerateLlmsTxt()
  const genOgTags = useGenerateOgTags()
  const genFaqSchema = useGenerateFaqSchema()

  const isPending =
    genJsonLd.isPending ||
    genLlmsTxt.isPending ||
    genOgTags.isPending ||
    genFaqSchema.isPending

  const handleGenerate = async () => {
    try {
      let result: FixGenerateResponse | undefined

      switch (indicator.indicator) {
        case 'json-ld':
          result = await genJsonLd.mutateAsync({
            type: 'Organization',
            name: site.name,
            url: site.url,
          })
          break
        case 'llms-txt':
          result = await genLlmsTxt.mutateAsync({
            title: site.name,
            description: `${site.name} 的官方網站`,
            url: site.url,
          })
          break
        case 'og-tags':
          result = await genOgTags.mutateAsync({
            title: site.name,
            description: `${site.name} 的官方網站`,
            url: site.url,
          })
          break
        case 'faq-schema':
          result = await genFaqSchema.mutateAsync({
            faqs: [
              {
                question: `什麼是 ${site.name}？`,
                answer: `${site.name} 是一個位於 ${site.url} 的網站。`,
              },
            ],
          })
          break
      }

      if (result) {
        onGenerated(result.code, result.language)
        toast.success('修復程式碼已生成')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '生成修復失敗，請稍後再試')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-blue-600 border-blue-200 hover:bg-blue-50"
      onClick={handleGenerate}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      生成修復
    </Button>
  )
}

// ── Indicator Row with expandable fix section ──
function IndicatorRow({
  result,
  site,
}: {
  result: ScanResultItem
  site: { name: string; url: string }
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [generatedFix, setGeneratedFix] = useState<{
    code: string
    language: string
  } | null>(
    result.generatedCode
      ? { code: result.generatedCode, language: 'html' }
      : null,
  )

  const displayName = indicatorNames[result.indicator] || result.indicator
  const canFix = result.autoFixable && fixableIndicators.has(result.indicator)

  return (
    <Card>
      <CardContent className="p-0">
        {/* Main indicator info */}
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
          onClick={() => canFix && setIsExpanded(!isExpanded)}
        >
          {/* Expand / collapse icon for fixable indicators */}
          <div className="w-5 flex-shrink-0">
            {canFix ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : null}
          </div>

          {/* Status icon */}
          <StatusIcon status={result.status} />

          {/* Name and score bar */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">
                {displayName}
              </span>
              <span className="text-sm font-semibold tabular-nums ml-2">
                {result.score}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  result.score >= 80
                    ? 'bg-green-500'
                    : result.score >= 60
                    ? 'bg-blue-500'
                    : result.score >= 40
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${result.score}%` }}
              />
            </div>
          </div>

          {/* Status badge */}
          <Badge
            className={
              result.status === 'pass'
                ? 'bg-green-500 text-white hover:bg-green-500/80'
                : result.status === 'warning'
                ? 'bg-yellow-500 text-white hover:bg-yellow-500/80'
                : 'bg-red-500 text-white hover:bg-red-500/80'
            }
          >
            {result.status === 'pass'
              ? '通過'
              : result.status === 'warning'
              ? '警告'
              : '未通過'}
          </Badge>

          {/* Generate fix button (don't expand when clicking the button) */}
          {canFix && !generatedFix && (
            <div onClick={(e) => e.stopPropagation()}>
              <GenerateFixButton
                indicator={result}
                site={site}
                onGenerated={(code, language) =>
                  setGeneratedFix({ code, language })
                }
              />
            </div>
          )}
        </div>

        {/* Suggestion text */}
        {result.suggestion && (
          <div className="px-4 pb-3 pl-[3.75rem]">
            <p className="text-xs text-muted-foreground">{result.suggestion}</p>
          </div>
        )}

        {/* Expanded fix section */}
        {isExpanded && canFix && (
          <div className="border-t bg-gray-50/50 p-4 pl-[3.75rem] space-y-3">
            {generatedFix ? (
              <>
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>修復程式碼已就緒 -- 複製並貼入您的網頁中</span>
                </div>
                <CodeSnippetViewer
                  code={generatedFix.code}
                  language={generatedFix.language}
                />
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p>
                  點擊「生成修復」按鈕，系統將自動根據您的網站資訊產生修復程式碼。
                </p>
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <GenerateFixButton
                    indicator={result}
                    site={site}
                    onGenerated={(code, language) =>
                      setGeneratedFix({ code, language })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Loading skeleton ──
function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <Skeleton className="h-[160px] w-[160px] rounded-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Main page component ──
export default function SiteDetailPage() {
  const params = useParams()
  const siteId = params.siteId as string

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const {
    data: scans,
    isLoading: scansLoading,
    isRefetching: scansRefetching,
  } = useScanHistory(siteId)
  const triggerScanMutation = useTriggerScan()
  const [isScanning, setIsScanning] = useState(false)

  // Get the latest completed scan
  const latestScan = useMemo(() => {
    if (!scans || scans.length === 0) return null
    // scans are ordered by createdAt desc from the API
    return scans.find((s) => s.status === 'COMPLETED') || scans[0]
  }, [scans])

  const latestScanId = latestScan?.id || ''

  const { data: scanResults, isLoading: resultsLoading } =
    useScanResults(latestScanId)

  // Prepare chart data from scan history
  const chartData = useMemo(() => {
    if (!scans) return []
    return scans
      .filter((s) => s.status === 'COMPLETED')
      .reverse()
      .map((s) => ({
        month: new Date(s.createdAt).toLocaleDateString('zh-TW', {
          month: 'short',
          day: 'numeric',
        }),
        score: s.totalScore,
      }))
  }, [scans])

  // Counts for summary
  const summary = useMemo(() => {
    if (!scanResults) return { pass: 0, warning: 0, fail: 0 }
    return {
      pass: scanResults.filter((r) => r.status === 'pass').length,
      warning: scanResults.filter((r) => r.status === 'warning').length,
      fail: scanResults.filter((r) => r.status === 'fail').length,
    }
  }, [scanResults])

  const handleScan = async () => {
    setIsScanning(true)
    try {
      await triggerScanMutation.mutateAsync(siteId)
      toast.success('掃描已啟動，結果將在數秒後顯示')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '掃描失敗，請稍後再試')
    } finally {
      setIsScanning(false)
    }
  }

  const isLoading = siteLoading || scansLoading

  if (isLoading) {
    return <DetailSkeleton />
  }

  if (!site) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900">找不到網站</h2>
          <p className="text-muted-foreground mt-1">
            該網站不存在或您無權存取
          </p>
          <Link href="/sites">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回網站列表
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const overallScore = latestScan?.totalScore ?? 0
  const lastScanDate = latestScan?.createdAt
    ? new Date(latestScan.createdAt).toLocaleString('zh-TW')
    : '尚未掃描'

  return (
    <div className="space-y-6">
      {/* Back link + page header */}
      <div>
        <Link
          href="/sites"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回網站列表
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{site.name}</h1>
              {latestScan && <ScanStatusBadge status={latestScan.status} />}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3.5 w-3.5" />
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {site.url}
                </a>
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                上次掃描: {lastScanDate}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/sites/${siteId}/fix`}>
              <Button variant="outline">
                <Wrench className="h-4 w-4 mr-2" />
                修復工具
              </Button>
            </Link>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isScanning ? '掃描中...' : '重新掃描'}
            </Button>
          </div>
        </div>
      </div>

      {/* Score overview row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Big score gauge */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">GEO 分數</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-6">
            <ScoreGauge score={overallScore} size={180} />
          </CardContent>
          {/* Summary counts */}
          <CardContent className="pt-0 pb-6">
            <div className="flex items-center justify-around text-sm">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>
                  <strong>{summary.pass}</strong> 通過
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>
                  <strong>{summary.warning}</strong> 警告
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>
                  <strong>{summary.fail}</strong> 未通過
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Indicator results */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>GEO 指標分析</CardTitle>
            <CardDescription>
              {scanResults
                ? `${scanResults.length} 項指標的詳細分數`
                : '載入指標結果中...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resultsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
                ))}
              </div>
            ) : !scanResults || scanResults.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {latestScan
                  ? latestScan.status === 'PENDING' ||
                    latestScan.status === 'RUNNING'
                    ? '掃描進行中，請稍候...'
                    : '尚無指標結果'
                  : '尚未執行掃描，請點擊「重新掃描」'}
              </div>
            ) : (
              <div className="space-y-3">
                {scanResults.map((result) => (
                  <IndicatorRow
                    key={result.id}
                    result={result}
                    site={{ name: site.name, url: site.url }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scan history chart */}
      <Card>
        <CardHeader>
          <CardTitle>掃描記錄</CardTitle>
          <CardDescription>歷次掃描分數變化趨勢</CardDescription>
        </CardHeader>
        <CardContent>
          {scansLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              至少需要一次掃描記錄才能顯示趨勢圖表
            </div>
          ) : (
            <ScanHistoryChart data={chartData} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
