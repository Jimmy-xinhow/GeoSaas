'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Sparkles,
  Wrench,
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
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CodeSnippetViewer } from '@/components/fix/code-snippet-viewer'
import { FixGuide } from '@/components/fix/fix-guide'
import { useSite } from '@/hooks/use-sites'
import {
  useScanHistory,
  useScanResults,
  type ScanResultItem,
} from '@/hooks/use-scan'
import { useSmartGenerate } from '@/hooks/use-fix'

// ── Indicator display names (DB stores underscores) ──
const indicatorNames: Record<string, string> = {
  'json_ld': '結構化資料 (JSON-LD)',
  'llms_txt': 'llms.txt',
  'og_tags': 'Open Graph 標籤',
  'meta_description': 'Meta 描述',
  'faq_schema': 'FAQ Schema',
  'title_optimization': '標題最佳化',
  'contact_info': '聯絡資訊',
  'image_alt': '圖片 Alt 文字',
}

// ── Severity mapping from indicator status ──
function getSeverity(
  status: string,
  score: number,
): 'high' | 'medium' | 'low' {
  if (status === 'fail' || score < 40) return 'high'
  if (status === 'warning' || score < 70) return 'medium'
  return 'low'
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case 'high':
      return 'text-red-400 bg-red-500/20 border-red-500/30'
    case 'medium':
      return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30'
    case 'low':
      return 'text-green-400 bg-green-500/20 border-green-500/30'
    default:
      return 'text-gray-400 bg-white/5 border-white/10'
  }
}

function getSeverityLabel(severity: string) {
  switch (severity) {
    case 'high':
      return '高優先'
    case 'medium':
      return '中優先'
    case 'low':
      return '低優先'
    default:
      return severity
  }
}

// ── Which indicators support code generation ──
const fixableIndicators = new Set([
  'json_ld',
  'llms_txt',
  'og_tags',
  'faq_schema',
])

// ── Fix Item Card ──
function FixItemCard({
  result,
  site,
  siteId,
}: {
  result: ScanResultItem
  site: { name: string; url: string }
  siteId: string
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

  const smartGenerate = useSmartGenerate()
  const isGenerating = smartGenerate.isPending

  const displayName = indicatorNames[result.indicator] || result.indicator
  const severity = getSeverity(result.status, result.score)
  const canGenerate = fixableIndicators.has(result.indicator)

  const handleGenerate = async () => {
    try {
      const res = await smartGenerate.mutateAsync({
        siteId,
        indicator: result.indicator,
        scanResultId: result.id,
      })
      setGeneratedFix({ code: res.code, language: res.language })
      toast.success('AI 已根據網站內容生成修復程式碼')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '生成修復失敗')
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="min-w-0">
              <CardTitle className="text-base">{displayName}</CardTitle>
              <CardDescription className="mt-1">
                {result.suggestion || `分數: ${result.score}/100`}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-semibold tabular-nums">
              {result.score}
            </span>
            <span
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border',
                getSeverityStyle(severity),
              )}
            >
              {getSeverityLabel(severity)}
            </span>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          <div className="border-t border-white/10 pt-4">
            {/* If already has generated code */}
            {generatedFix ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Sparkles className="h-4 w-4" />
                  <span>程式碼已生成 — 尚未修復，請依照以下步驟操作</span>
                </div>
                <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg text-sm text-amber-300">
                  <p className="font-medium">操作步驟：</p>
                  <ol className="list-decimal list-inside mt-1 space-y-1">
                    <li>點擊右上角「複製」按鈕複製程式碼</li>
                    <li>將程式碼貼入您網站的 HTML 對應位置</li>
                    <li>回到網站詳情頁點擊「重新掃描」以驗證修復是否成功</li>
                  </ol>
                </div>
                <CodeSnippetViewer
                  code={generatedFix.code}
                  language={generatedFix.language}
                />
                {canGenerate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1.5" />
                    )}
                    重新生成
                  </Button>
                )}
              </div>
            ) : canGenerate ? (
              <div className="space-y-4">
                <FixGuide
                  indicator={result.indicator}
                  siteName={site.name}
                  siteUrl={site.url}
                  details={result.details}
                />
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5" />
                  )}
                  一鍵生成修復程式碼
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <FixGuide
                  indicator={result.indicator}
                  siteName={site.name}
                  siteUrl={site.url}
                  details={result.details}
                />
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Loading skeleton ──
function FixPageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ── Main Fix Page ──
export default function FixPage() {
  const params = useParams()
  const siteId = params.siteId as string

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: scans, isLoading: scansLoading } = useScanHistory(siteId)

  // Get latest completed scan
  const latestScan = useMemo(() => {
    if (!scans || scans.length === 0) return null
    return scans.find((s) => s.status === 'COMPLETED') || scans[0]
  }, [scans])

  const latestScanId = latestScan?.id || ''
  const { data: scanResults, isLoading: resultsLoading } =
    useScanResults(latestScanId)

  // Filter to only fixable / actionable items (not passing)
  const fixableResults = useMemo(() => {
    if (!scanResults) return []
    // Show fail first, then warning, sorted by score ascending within each group
    return [...scanResults]
      .filter((r) => r.status !== 'pass' || r.autoFixable)
      .sort((a, b) => {
        const order = { fail: 0, warning: 1, pass: 2 }
        const aOrder = order[a.status as keyof typeof order] ?? 3
        const bOrder = order[b.status as keyof typeof order] ?? 3
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.score - b.score
      })
  }, [scanResults])

  // Summary counts
  const counts = useMemo(() => {
    if (!scanResults) return { high: 0, medium: 0, passed: 0 }
    return {
      high: scanResults.filter(
        (r) => r.status === 'fail' || r.score < 40,
      ).length,
      medium: scanResults.filter(
        (r) => r.status === 'warning' && r.score >= 40,
      ).length,
      passed: scanResults.filter((r) => r.status === 'pass').length,
    }
  }, [scanResults])

  const isLoading = siteLoading || scansLoading || resultsLoading

  if (isLoading) {
    return <FixPageSkeleton />
  }

  if (!site) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-white">找不到網站</h2>
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

  return (
    <div className="space-y-6">
      {/* Back link + page header */}
      <div>
        <Link
          href={`/sites/${siteId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回網站詳情
        </Link>
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-white">修復工具</h1>
            <p className="text-muted-foreground mt-1">
              {site.name} -- 根據掃描結果，以下是建議修復的項目
            </p>
          </div>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4 text-red-500" />
          <span>
            <strong>{counts.high}</strong> 高優先
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span>
            <strong>{counts.medium}</strong> 中優先
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>
            <strong>{counts.passed}</strong> 已通過
          </span>
        </div>
      </div>

      {/* Fix items list */}
      {fixableResults.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">
                所有指標都已通過
              </h3>
              <p className="text-muted-foreground">
                目前沒有需要修復的項目，您的網站表現良好！
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fixableResults.map((result) => (
            <FixItemCard
              key={result.id}
              result={result}
              site={{ name: site.name, url: site.url }}
              siteId={siteId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
