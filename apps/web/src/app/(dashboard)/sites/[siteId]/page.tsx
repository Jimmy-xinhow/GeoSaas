'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  Info,
  ChevronDown,
  ChevronRight,
  BookOpen,
  FileText,
  Bot,
  PlugZap,
  SearchCheck,
  LockKeyhole,
  Pencil,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { ScoreGauge } from '@/components/scan/score-gauge'
import { IndicatorCard } from '@/components/scan/indicator-card'
import ScanHistoryChart from '@/components/scan/scan-history-chart'
import { CodeSnippetViewer } from '@/components/fix/code-snippet-viewer'
import apiClient from '@/lib/api-client'
import { isBillingRequiredError } from '@/lib/billing-error'
import { useBrandFactReadiness, useSite, useUpdateSite, useUpdateSiteProfile, type BrandFactReadiness, type SiteProfile } from '@/hooks/use-sites'
import {
  useTriggerScan,
  useRunDeepAnalysis,
  useScanHistory,
  useScanResults,
  type DeepAnalysisResult,
  type Scan,
  type ScanResultItem,
} from '@/hooks/use-scan'
import { useSmartGenerate } from '@/hooks/use-fix'

// ── Indicator display name mapping (DB stores underscores) ──
const indicatorNames: Record<string, string> = {
  'json_ld': '結構化資料 (JSON-LD)',
  'llms_txt': 'llms.txt',
  'og_tags': 'Open Graph 標籤',
  'meta_description': 'Meta 描述',
  'faq_schema': 'FAQ Schema',
  'title_optimization': '標題最佳化',
  'contact_info': '聯絡資訊',
  'image_alt': '圖片 Alt 文字',
  'robots_ai': 'AI 爬蟲存取設定',
}

// ── Which indicators can generate fixes ──
const fixableIndicators = new Set([
  'json_ld',
  'llms_txt',
  'og_tags',
  'faq_schema',
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
    PENDING: { label: '排隊中', className: 'bg-white/10 text-gray-400' },
    RUNNING: { label: '掃描中', className: 'bg-blue-500/20 text-blue-400' },
    COMPLETED: { label: '已完成', className: 'bg-green-500/20 text-green-400' },
    FAILED: { label: '失敗', className: 'bg-red-500/20 text-red-400' },
  }
  const c = config[status] || config.PENDING
  return <Badge className={c.className}>{c.label}</Badge>
}

// ── Generate Fix Button (per indicator, AI-powered) ──
function GenerateFixButton({
  indicator,
  siteId,
  onGenerated,
}: {
  indicator: ScanResultItem
  siteId: string
  onGenerated: (code: string, language: string) => void
}) {
  const smartGenerate = useSmartGenerate()

  const handleGenerate = async () => {
    try {
      const result = await smartGenerate.mutateAsync({
        siteId,
        indicator: indicator.indicator,
        scanResultId: indicator.id,
      })
      onGenerated(result.code, result.language)
      toast.success('AI 已根據網站內容生成修復程式碼')
    } catch (err: any) {
      if (isBillingRequiredError(err)) return
      toast.error(err?.response?.data?.message || '生成修復失敗，請稍後再試')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
      onClick={handleGenerate}
      disabled={smartGenerate.isPending}
    >
      {smartGenerate.isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      AI 生成修復
    </Button>
  )
}

// ── Indicator Row with expandable fix section ──
function IndicatorRow({
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

  const displayName = indicatorNames[result.indicator] || result.indicator
  const canFix = result.autoFixable && fixableIndicators.has(result.indicator)

  return (
    <Card>
      <CardContent className="p-0">
        {/* Main indicator info */}
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
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
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
                siteId={siteId}
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
          <div className="border-t border-white/10 bg-white/5 p-4 pl-[3.75rem] space-y-3">
            {generatedFix ? (
              <>
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Sparkles className="h-4 w-4" />
                  <span>程式碼已生成 — 尚未修復</span>
                </div>
                <p className="text-xs text-amber-300 bg-amber-500/20 border border-amber-500/30 rounded p-2">
                  請點擊「複製」按鈕複製程式碼，貼入您網站的 HTML 中，然後重新掃描以驗證修復效果
                </p>
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
                    siteId={siteId}
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

interface BadgeEmbedCode {
  available: boolean
  message?: string
  imgTag?: string
  iframeTag?: string
  markdownBadge?: string
  svgUrl?: string
}

function BadgeSection({ siteId }: { siteId: string }) {
  const [embedCode, setEmbedCode] = useState<BadgeEmbedCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'html' | 'markdown' | 'help'>('html')

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    apiClient
      .get<BadgeEmbedCode>(`/badge/${siteId}/embed-code`)
      .then(({ data }) => {
        if (mounted) setEmbedCode(data)
      })
      .catch(() => {
        if (mounted) {
          setEmbedCode({
            available: false,
            message: '暫時無法取得 Badge 狀態，請稍後再試。',
          })
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [siteId])

  const currentCode = activeTab === 'markdown' ? embedCode?.markdownBadge : embedCode?.imgTag

  const copyCode = async () => {
    if (!currentCode) return
    try {
      await navigator.clipboard.writeText(currentCode)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = currentCode
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    toast.success('已複製 Badge 程式碼')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>取得 Badge</CardTitle>
        <CardDescription>
          將 GEO 分數 Badge 放到你的網站、README 或合作頁面。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : embedCode?.available ? (
          <>
            {embedCode.svgUrl && (
              <div className="rounded-lg border border-white/10 bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={embedCode.svgUrl} alt="GEO Score badge preview" width={148} height={20} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant={activeTab === 'html' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('html')}>
                HTML
              </Button>
              <Button variant={activeTab === 'markdown' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('markdown')}>
                Markdown
              </Button>
              <Button variant={activeTab === 'help' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('help')}>
                安裝說明
              </Button>
            </div>
            {activeTab === 'help' ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground space-y-2">
                <p>WordPress: Appearance / Widgets / Custom HTML.</p>
                <p>Webflow: add an Embed element and paste the HTML.</p>
                <p>Squarespace: use a Code Block.</p>
                <p>General HTML: paste it where the badge should appear.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <pre className="max-h-44 overflow-auto rounded-lg border border-white/10 bg-gray-950 p-4 text-xs text-gray-200">
                  {currentCode}
                </pre>
                <Button variant="outline" size="sm" onClick={copyCode}>
                  複製程式碼
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            {embedCode?.message || '此網站目前尚無可公開嵌入的 Badge。'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page component ──
function DeepAnalysisSection({ siteId }: { siteId: string }) {
  const runDeepAnalysis = useRunDeepAnalysis()
  const [analysis, setAnalysis] = useState<DeepAnalysisResult | null>(null)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)

  const run = async () => {
    setUpgradeMessage(null)
    try {
      const result = await runDeepAnalysis.mutateAsync(siteId)
      setAnalysis(result)
      toast.success('站內深度分析完成')
    } catch (err: any) {
      const payload = err?.response?.data?.message
      const message =
        typeof payload === 'object'
          ? payload.message
          : err?.response?.data?.message
      if (err?.response?.status === 403) {
        setUpgradeMessage(message || '站內深度分析需要 Pro 方案。')
        return
      }
      toast.error(message || '站內深度分析失敗，請稍後再試')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SearchCheck className="h-5 w-5 text-blue-400" />
              站內深度分析
              <Badge className="bg-blue-500/20 text-blue-200">Pro</Badge>
            </CardTitle>
            <CardDescription>
              抽樣掃描首頁與內頁，判斷 FAQ Schema、Article Schema 與問答型內容是否真的出現在公開 HTML。
            </CardDescription>
          </div>
          <Button onClick={run} disabled={runDeepAnalysis.isPending}>
            {runDeepAnalysis.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <SearchCheck className="h-4 w-4 mr-2" />
            )}
            執行深度分析
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {upgradeMessage && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 text-blue-300" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-blue-100">需要升級 Pro 才能使用</p>
                <p className="text-sm text-blue-100/80">{upgradeMessage}</p>
                <Link href="/settings#pricing">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    查看 Pro 方案
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {!analysis && !upgradeMessage && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
            此功能會檢查多個內頁，適合判斷「首頁沒有，但文章內是否有 FAQ Schema」這類情境。
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">{analysis.interpretation}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                分析時間：{new Date(analysis.analyzedAt).toLocaleString('zh-TW')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-white/10 bg-gray-950/50 p-3">
                <p className="text-xs text-muted-foreground">分析頁數</p>
                <p className="mt-1 text-2xl font-bold text-white">{analysis.summary.pagesAnalyzed}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-gray-950/50 p-3">
                <p className="text-xs text-muted-foreground">JSON-LD 頁面</p>
                <p className="mt-1 text-2xl font-bold text-white">{analysis.summary.jsonLdPages}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-gray-950/50 p-3">
                <p className="text-xs text-muted-foreground">FAQ Schema</p>
                <p className="mt-1 text-2xl font-bold text-white">{analysis.summary.faqSchemaPages}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-gray-950/50 p-3">
                <p className="text-xs text-muted-foreground">FAQ 題數</p>
                <p className="mt-1 text-2xl font-bold text-white">{analysis.summary.faqQuestionCount}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-gray-950/50 p-3">
                <p className="text-xs text-muted-foreground">問答型文字</p>
                <p className="mt-1 text-2xl font-bold text-white">{analysis.summary.visibleQuestionTextPages}</p>
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
              {analysis.pages.map((page) => (
                <div key={page.url} className="border-b border-white/10 p-3 last:border-b-0">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{page.title || page.url}</p>
                      <a href={page.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-300 hover:underline">
                        {page.url}
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {page.hasFaqSchema && <Badge className="bg-green-500/20 text-green-200">FAQPage</Badge>}
                      {page.hasArticleSchema && <Badge className="bg-blue-500/20 text-blue-200">Article</Badge>}
                      {page.jsonLdScripts > 0 && <Badge variant="outline">JSON-LD {page.jsonLdScripts}</Badge>}
                      {page.hasVisibleQuestionText && <Badge variant="outline">問答文字</Badge>}
                      {page.status === 'failed' && <Badge className="bg-red-500/20 text-red-200">失敗</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const missingFactLabels: Record<string, string> = {
  location: '品牌所在地或服務區域',
  services: '具體服務/產品項目',
  positioning: '品牌定位描述',
  contact: '聯絡方式',
  targetAudiences: '目標客群',
  notFor: '不適合/禁止描述',
  qaPairs: '至少 6 組品牌 Q&A',
  socialLinks: '社群連結',
}

function BrandFactReadinessSection({
  readiness,
  isLoading,
  siteId,
  profile,
}: {
  readiness?: BrandFactReadiness
  isLoading: boolean
  siteId: string
  profile?: SiteProfile | null
}) {
  const updateProfile = useUpdateSiteProfile(siteId)
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!readiness) return null

  const missing = readiness.missingFacts.map((key) => missingFactLabels[key] || key)
  const autoPublishingEnabled = readiness.ready && profile?.dailyContentPaused !== true
  const confidenceColor = readiness.ready
    ? 'text-green-400'
    : readiness.confidenceScore >= 40
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <Card id="ai-wiki-readiness" className="scroll-mt-24">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-400" />
              AI Wiki 可引用性
            </CardTitle>
            <CardDescription>
              client_daily 與 llms-full 會依這些事實判斷能不能生成可被 AI 引用的內容。
            </CardDescription>
          </div>
          <Badge className={readiness.ready ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}>
            {readiness.ready ? '可生成' : '需補資料'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-muted-foreground">資料可信度</p>
            <p className={`mt-1 text-3xl font-bold ${confidenceColor}`}>{readiness.confidenceScore}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-muted-foreground">已驗證資料</p>
            <p className="mt-1 text-3xl font-bold text-white">{readiness.verifiedFacts.length}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-muted-foreground">問答數量</p>
            <p className="mt-1 text-3xl font-bold text-white">{readiness.qaPairs.length}</p>
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${autoPublishingEnabled ? 'border-green-500/30 bg-green-500/10' : 'border-white/10 bg-white/5'}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white">AI Wiki 自動產文</p>
              <p className="mt-1 text-xs text-muted-foreground">
                啟用前必須完成品牌定位、服務、地點、聯絡方式、目標受眾、不適合對象與至少 6 組 Q&A。
              </p>
            </div>
            <Button
              size="sm"
              variant={autoPublishingEnabled ? 'outline' : 'default'}
              disabled={!readiness.ready || updateProfile.isPending}
              onClick={async () => {
                try {
                  await updateProfile.mutateAsync({
                    ...(profile || {}),
                    dailyContentPaused: autoPublishingEnabled,
                  })
                  toast.success(autoPublishingEnabled ? '已暫停自動產文' : '已啟用自動產文')
                } catch (err: any) {
                  const missingFacts = err?.response?.data?.missingFacts
                  const detail = Array.isArray(missingFacts) && missingFacts.length > 0
                    ? `缺少：${missingFacts.map((key) => missingFactLabels[key] || key).join('、')}`
                    : err?.response?.data?.message
                  toast.error(detail || '自動產文設定更新失敗')
                }
              }}
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  更新中
                </>
              ) : autoPublishingEnabled ? '暫停自動產文' : readiness.ready ? '啟用自動產文' : '資料未完成'}
            </Button>
          </div>
        </div>

        {missing.length > 0 ? (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <p className="text-sm font-medium text-yellow-200">下一步應補齊</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.map((item) => (
                <Badge key={item} variant="outline" className="border-yellow-500/40 text-yellow-100">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
            這個品牌已具備基本可引用事實，後續每日內容可以安全生成。
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href={`/sites/${siteId}/knowledge`}>
            <Button variant="outline" size="sm">
              補 Q&A
            </Button>
          </Link>
          <Link href={`/sites/${siteId}/llms-txt`}>
            <Button variant="outline" size="sm">
              更新 llms.txt
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileFactsEditor({
  siteId,
  profile,
}: {
  siteId: string
  profile?: SiteProfile | null
}) {
  const updateProfile = useUpdateSiteProfile(siteId)
  const [form, setForm] = useState({
    description: profile?.description || '',
    services: profile?.services || '',
    positioning: profile?.positioning || profile?.uniqueValue || '',
    location: profile?.location || '',
    contact: profile?.contact || profile?.contactInfo || '',
    targetAudience: profile?.targetAudience || profile?.targetAudiences?.join(', ') || '',
    notFor: profile?.notFor?.join(', ') || profile?.forbidden?.join(', ') || '',
  })

  useEffect(() => {
    setForm({
      description: profile?.description || '',
      services: profile?.services || '',
      positioning: profile?.positioning || profile?.uniqueValue || '',
      location: profile?.location || '',
      contact: profile?.contact || profile?.contactInfo || '',
      targetAudience: profile?.targetAudience || profile?.targetAudiences?.join(', ') || '',
      notFor: profile?.notFor?.join(', ') || profile?.forbidden?.join(', ') || '',
    })
  }, [profile])

  const setField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    const split = (value: string) =>
      value
        .split(/[,，、;；\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)

    try {
      await updateProfile.mutateAsync({
        ...(profile || {}),
        description: form.description.trim(),
        services: form.services.trim(),
        positioning: form.positioning.trim(),
        uniqueValue: form.positioning.trim(),
        location: form.location.trim(),
        contact: form.contact.trim(),
        contactInfo: form.contact.trim(),
        targetAudience: form.targetAudience.trim(),
        targetAudiences: split(form.targetAudience),
        notFor: split(form.notFor),
        forbidden: split(form.notFor),
      })
      toast.success('品牌事實已更新')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '品牌事實更新失敗')
    }
  }

  const fieldClass = 'w-full rounded-md border border-white/10 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'

  return (
    <Card id="brand-facts" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>品牌事實資料</CardTitle>
        <CardDescription>
          這裡的資料會進入 BrandFact 與 AI Wiki 內容生成，請只填可公開、可被引用的事實。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">品牌描述</span>
            <textarea className={fieldClass} rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">服務/產品項目</span>
            <textarea className={fieldClass} rows={3} value={form.services} onChange={(e) => setField('services', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">品牌定位</span>
            <textarea className={fieldClass} rows={3} value={form.positioning} onChange={(e) => setField('positioning', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">所在地/服務區域</span>
            <input className={fieldClass} value={form.location} onChange={(e) => setField('location', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">公開聯絡方式</span>
            <input className={fieldClass} value={form.contact} onChange={(e) => setField('contact', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">目標客群，用逗號或頓號分隔</span>
            <input className={fieldClass} value={form.targetAudience} onChange={(e) => setField('targetAudience', e.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs text-muted-foreground">不適合/禁止描述，用逗號或頓號分隔</span>
            <input className={fieldClass} value={form.notFor} onChange={(e) => setField('notFor', e.target.value)} />
          </label>
        </div>
        <Button onClick={save} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          儲存品牌事實
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SiteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const siteId = params.siteId as string
  const isAfterCmsFix = searchParams.get('afterCmsFix') === '1'
  const shouldAutoScanAfterCmsFix = isAfterCmsFix && searchParams.get('autoScan') === '1'

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: brandFacts, isLoading: brandFactsLoading } = useBrandFactReadiness(siteId)
  const queryClient = useQueryClient()
  const updateSiteMutation = useUpdateSite()
  const [isRenamingSite, setIsRenamingSite] = useState(false)
  const [siteNameDraft, setSiteNameDraft] = useState('')
  const {
    data: scans,
    isLoading: scansLoading,
    isRefetching: scansRefetching,
  } = useScanHistory(siteId)
  const triggerScanMutation = useTriggerScan()
  const autoScanStartedRef = useRef(false)
  const redirectAfterScanRef = useRef(false)

  // Derive scanning state from actual scan data
  const hasActiveScan = useMemo(() => {
    if (!scans) return false
    return scans.some((s) => s.status === 'PENDING' || s.status === 'RUNNING')
  }, [scans])

  // Track previous active scan state to detect completion
  const prevActiveRef = useRef(hasActiveScan)
  useEffect(() => {
    if (prevActiveRef.current && !hasActiveScan) {
      // Scan just completed — invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['sites', siteId] })
      queryClient.invalidateQueries({ queryKey: ['scan-results'] })
      if (redirectAfterScanRef.current) {
        redirectAfterScanRef.current = false
        toast.success('修復後掃描已完成，正在開啟完成報告')
        router.push(`/sites/${siteId}/guided-fix?tab=report&afterCmsFix=1`)
      } else {
        toast.success('掃描已完成！')
      }
    }
    prevActiveRef.current = hasActiveScan
  }, [hasActiveScan, queryClient, router, siteId])

  // Find the best scan — skip scans with empty results
  const [scanIdx, setScanIdx] = useState(0)

  const completedScans = useMemo(() => {
    if (!scans) return []
    return scans.filter((s: any) => s.status === 'COMPLETED')
  }, [scans])

  const latestScanId = completedScans[scanIdx]?.id || ''
  const latestScan = completedScans[scanIdx] || (scans?.[0] ?? null)

  const { data: scanResults, isLoading: resultsLoading } =
    useScanResults(latestScanId)

  useEffect(() => {
    if (resultsLoading || !latestScanId) return
    if (scanResults && scanResults.length === 0 && scanIdx < completedScans.length - 1) {
      setScanIdx((i) => i + 1)
    }
  }, [scanResults, resultsLoading, latestScanId, scanIdx, completedScans.length])

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

  const actionableIssues = useMemo(() => {
    if (!scanResults) return []
    return scanResults.filter((r) => r.status !== 'pass' || r.score < 90)
  }, [scanResults])

  const handleScan = async (redirectToCompletionReport = false) => {
    try {
      if (redirectToCompletionReport) {
        redirectAfterScanRef.current = true
      }
      await triggerScanMutation.mutateAsync(siteId)
      toast.success(redirectToCompletionReport ? '修復後重新掃描已啟動，完成後會開啟完成報告' : '掃描已啟動，系統將自動更新結果')
    } catch (err: any) {
      if (redirectToCompletionReport) {
        redirectAfterScanRef.current = false
      }
      toast.error(err?.response?.data?.message || '掃描失敗，請稍後再試')
    }
  }

  const startRenameSite = () => {
    if (!site) return
    setSiteNameDraft(site.name || '')
    setIsRenamingSite(true)
  }

  const cancelRenameSite = () => {
    setIsRenamingSite(false)
    setSiteNameDraft('')
  }

  const saveRenameSite = async () => {
    if (!site) return
    const nextName = siteNameDraft.trim()
    if (!nextName) {
      toast.error('請輸入網站名稱')
      return
    }
    if (nextName === site.name) {
      cancelRenameSite()
      return
    }

    try {
      await updateSiteMutation.mutateAsync({ id: site.id, name: nextName })
      toast.success('網站名稱已更新')
      cancelRenameSite()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '更新網站名稱失敗，請稍後再試')
    }
  }

  useEffect(() => {
    if (!shouldAutoScanAfterCmsFix || autoScanStartedRef.current || scansLoading || !scans) return
    if (hasActiveScan || triggerScanMutation.isPending) {
      redirectAfterScanRef.current = true
      return
    }
    autoScanStartedRef.current = true
    handleScan(true)
  }, [hasActiveScan, scans, scansLoading, shouldAutoScanAfterCmsFix, triggerScanMutation.isPending])

  const isPostFixFlowActive = isAfterCmsFix && (hasActiveScan || triggerScanMutation.isPending || shouldAutoScanAfterCmsFix)

  const isLoading = siteLoading || scansLoading

  if (isLoading) {
    return <DetailSkeleton />
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

  const overallScore = latestScan?.totalScore ?? 0
  const lastScanDate = latestScan?.createdAt
    ? new Date(latestScan.createdAt).toLocaleString('zh-TW')
    : '尚未掃描'
  const issueCount = actionableIssues.length
  const hasCompletedScan = completedScans.length > 0
  const nextStep = hasActiveScan
    ? {
        title: '正在掃描網站',
        description: '掃描完成後會自動整理分數、缺失項目與可修復內容。',
        label: '掃描中...',
        kind: 'active' as const,
      }
    : isAfterCmsFix && hasCompletedScan
    ? {
        title: '修復後重新掃描驗證',
        description: '修復包已送出後，下一步是重新掃描網站，確認 WordPress 是否真的套用了結構化資料與 llms.txt。',
        label: '開始重新掃描',
        kind: 'scan' as const,
      }
    : !hasCompletedScan
    ? {
        title: '先完成第一次掃描',
        description: '系統會先建立網站的 GEO 分數與缺失清單，後續修復才有依據。',
        label: '開始第一次掃描',
        kind: 'scan' as const,
      }
    : issueCount > 0
    ? {
        title: '依照引導修復缺失項目',
        description: `目前有 ${issueCount} 個項目需要處理，建議先用引導流程逐步完成。`,
        label: '開始引導修復',
        kind: 'guided' as const,
      }
    : {
        title: '補強 AI 可引用的品牌內容',
        description: '分數已經穩定，下一步是補充品牌事實與問答，提升被 AI 正確引用的機率。',
        label: '補強知識庫',
        kind: 'knowledge' as const,
      }

  return (
    <div className="space-y-6">
      <SiteWorkspaceTabs siteId={siteId} siteName={site.name} />

      {/* page header */}
      <div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {isRenamingSite ? (
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    value={siteNameDraft}
                    onChange={(e) => setSiteNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRenameSite()
                      if (e.key === 'Escape') cancelRenameSite()
                    }}
                    className="h-10 w-[min(22rem,70vw)] text-lg font-semibold"
                    autoFocus
                    maxLength={120}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                    onClick={saveRenameSite}
                    disabled={updateSiteMutation.isPending}
                    aria-label="儲存網站名稱"
                  >
                    {updateSiteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-gray-400 hover:bg-white/10 hover:text-white"
                    onClick={cancelRenameSite}
                    disabled={updateSiteMutation.isPending}
                    aria-label="取消更名"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-2xl font-bold text-white">{site.name}</h1>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-gray-400 hover:bg-white/10 hover:text-white"
                    onClick={startRenameSite}
                    aria-label={`更名 ${site.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            {nextStep.kind === 'guided' ? (
              <Link href={`/sites/${siteId}/guided-fix`}>
                <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                  <SearchCheck className="h-4 w-4 mr-2" />
                  {nextStep.label}
                </Button>
              </Link>
            ) : nextStep.kind === 'knowledge' ? (
              <Link href={`/sites/${siteId}/knowledge`}>
                <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                  <BookOpen className="h-4 w-4 mr-2" />
                  {nextStep.label}
                </Button>
              </Link>
            ) : (
              <Button
                className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                onClick={() => handleScan(isAfterCmsFix)}
                disabled={hasActiveScan || triggerScanMutation.isPending}
              >
                {hasActiveScan || triggerScanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {hasActiveScan ? '掃描中...' : triggerScanMutation.isPending ? '啟動中...' : nextStep.label}
              </Button>
            )}

            <details className="group relative">
              <summary className="inline-flex h-10 w-full cursor-pointer list-none items-center justify-center rounded-md border border-white/15 px-4 text-sm font-medium text-white hover:bg-white/10 sm:w-auto">
                更多工具
                <ChevronDown className="ml-2 h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border border-white/10 bg-slate-950 shadow-xl">
                <Link href={`/sites/${siteId}/fix`} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <Wrench className="h-4 w-4 text-blue-300" />
                  修復工具
                </Link>
                <Link href={`/sites/${siteId}/cms-fix`} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <PlugZap className="h-4 w-4 text-blue-300" />
                  CMS 一鍵修復
                </Link>
                <Link href={`/sites/${siteId}/llms-txt`} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <FileText className="h-4 w-4 text-blue-300" />
                  llms.txt
                </Link>
                <Link href={`/sites/${siteId}/crawler`} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <Bot className="h-4 w-4 text-blue-300" />
                  爬蟲追蹤
                </Link>
                <Link href={`/sites/${siteId}/knowledge`} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10">
                  <BookOpen className="h-4 w-4 text-blue-300" />
                  知識庫
                </Link>
                <button
                  type="button"
                  onClick={() => handleScan(false)}
                  disabled={hasActiveScan || triggerScanMutation.isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4 text-blue-300" />
                  重新掃描
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      <Card className="border-blue-500/30">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">
              建議下一步
            </p>
            <h2 className="text-lg font-semibold text-white">{nextStep.title}</h2>
            <p className="max-w-2xl text-sm text-blue-100/80">{nextStep.description}</p>
            {nextStep.kind === 'guided' && actionableIssues.length > 0 ? (
              <div className="mt-3 flex max-w-3xl flex-wrap gap-2">
                {actionableIssues.slice(0, 6).map((issue) => {
                  const canAutoFix = issue.autoFixable || fixableIndicators.has(issue.indicator)
                  return (
                    <span
                      key={issue.id}
                      className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-blue-50"
                    >
                      <StatusIcon status={issue.status} />
                      <span>{indicatorNames[issue.indicator] || issue.indicator}</span>
                      <span className={canAutoFix ? 'text-green-300' : 'text-yellow-200'}>
                        {canAutoFix ? '可自動修復' : '需人工處理'}
                      </span>
                    </span>
                  )
                })}
                {actionableIssues.length > 6 ? (
                  <span className="inline-flex items-center rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-blue-100/80">
                    +{actionableIssues.length - 6} 個在下方指標分析
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-blue-100/80">
            {['掃描', '修復', '補內容', '追蹤'].map((step, index) => (
              <div
                key={step}
                className={`rounded-md border px-3 py-2 ${
                  (nextStep.kind === 'scan' && index === 0) ||
                  (nextStep.kind === 'guided' && index === 1) ||
                  (nextStep.kind === 'knowledge' && index === 2) ||
                  (nextStep.kind === 'active' && index === 0)
                    ? 'border-blue-300 bg-blue-300/15 text-white'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                {step}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isAfterCmsFix ? (
        <Card className="border-green-500/30">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-green-100">修復包已派送，請重新掃描驗證結果</p>
              <p className="mt-1 text-sm text-green-100/80">
                重新掃描完成後，引導頁會依照最新結果更新，不會停留在派送前的修復步驟。
              </p>
            </div>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => handleScan(true)}
              disabled={hasActiveScan || triggerScanMutation.isPending}
            >
              {hasActiveScan || triggerScanMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {hasActiveScan ? '掃描中...' : triggerScanMutation.isPending ? '啟動中...' : '修復後重新掃描'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isPostFixFlowActive ? (
        <>
          <BrandFactReadinessSection
            readiness={brandFacts}
            isLoading={brandFactsLoading}
            siteId={siteId}
            profile={site.profile}
          />

          <ProfileFactsEditor siteId={siteId} profile={site.profile} />
        </>
      ) : null}

      {/* Scan progress banner */}
      {hasActiveScan && (
        <Card className="border-blue-500/30">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            <div>
              <p className="text-sm font-medium text-blue-300">
                掃描進行中...
              </p>
              <p className="text-xs text-blue-400">
                系統正在分析您的網站，完成後將自動更新結果
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                    siteId={siteId}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BadgeSection siteId={siteId} />

      <DeepAnalysisSection siteId={siteId} />

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
