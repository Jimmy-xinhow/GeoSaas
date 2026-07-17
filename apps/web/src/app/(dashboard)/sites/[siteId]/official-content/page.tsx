'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Copy, FileText, Globe2, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { MarkdownArticlePreview } from '@/components/content/markdown-article-preview'
import { useSite } from '@/hooks/use-sites'
import {
  useApproveOfficialSiteArticle,
  useGenerateOfficialSiteArticle,
  useOfficialArticleRecommendation,
  useOfficialPublishPackage,
  useOfficialSiteArticle,
  useOfficialSiteArticles,
  useVerifyOfficialSiteArticle,
  type OfficialQualityReport,
  type OfficialSiteArticle,
} from '@/hooks/use-official-site-content'

const STATUS_LABELS: Record<string, string> = {
  draft: '待審核',
  generating: '生成中',
  quality_failed: '品質未通過',
  approved: '已核准',
  export_ready: '可取得官網內容包',
  archived: '已封存',
}

const CHECK_LABELS: Record<string, string> = {
  minimumLength: '文章長度達標',
  maximumLength: '文章長度沒有過長',
  hasHeading: '包含文章標題',
  hasTitleConsistency: '正文標題與文章標題一致',
  hasStructuredSections: '段落結構清楚',
  includesBrandName: '包含品牌名稱',
  includesGroundedEntity: '包含已驗證的品牌/服務事實',
  hasFactCoverage: '至少使用兩項可驗證品牌事實',
  hasAnswerFirstOpening: '開頭直接回答品牌與服務',
  noPlaceholders: '沒有待補資料或佔位符',
  noPlatformReferences: '沒有平台內容字樣',
  hasFaq: '至少 3 組 FAQ',
  hasVisibleFaq: 'FAQ 問題完整出現在正文',
  hasAudienceBoundary: '適用對象與服務限制清楚',
  hasActionableAnswer: '包含直接答案與可執行步驟',
  hasAiReadableStructure: '具備 AI 可擷取的問答結構',
  metaDescriptionReady: 'Meta Description 可直接使用',
  keywordSetReady: '關鍵字組合完整',
  noUnsupportedPromises: '無未證實排名或成效承諾',
  noUnsupportedSpecificClaims: '無第一方未支持的年限、數據或效果宣稱',
  isScanAware: '已參考網站檢測重點',
  belowDuplicateThreshold: '與既有內容相似度低於門檻',
}

const DEFAULT_REQUIRED_GEO_CHECKS = [
  'minimumLength',
  'maximumLength',
  'hasHeading',
  'hasTitleConsistency',
  'hasStructuredSections',
  'includesBrandName',
  'includesGroundedEntity',
  'hasFactCoverage',
  'hasAnswerFirstOpening',
  'noPlaceholders',
  'noPlatformReferences',
  'hasFaq',
  'hasVisibleFaq',
  'hasAudienceBoundary',
  'noUnsupportedPromises',
  'noUnsupportedSpecificClaims',
  'belowDuplicateThreshold',
]

function getQualitySummary(report: OfficialQualityReport) {
  const requiredChecks = new Set(
    (report.requiredChecks?.length ? report.requiredChecks : DEFAULT_REQUIRED_GEO_CHECKS)
      .filter((key) => key in report.checks),
  )
  const failedRequiredChecks = report.failedRequiredChecks
    ?? [...requiredChecks].filter((key) => !report.checks[key])
  const advisoryFailedChecks = report.advisoryFailedChecks
    ?? Object.entries(report.checks)
      .filter(([key, passed]) => !passed && !requiredChecks.has(key))
      .map(([key]) => key)
  const scorePassed = report.scorePassed ?? report.score >= report.minimumScore
  const requiredPassed = report.requiredPassed ?? failedRequiredChecks.length === 0

  return {
    requiredChecks,
    failedRequiredChecks,
    advisoryFailedChecks,
    scorePassed,
    requiredPassed,
  }
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'quality_failed') return 'destructive'
  if (status === 'export_ready') return 'default'
  if (status === 'draft') return 'secondary'
  return 'outline'
}

function defaultPublishBaseUrl(siteUrl?: string) {
  if (!siteUrl) return ''
  try {
    return `${new URL(siteUrl).origin}/blog`
  } catch {
    return ''
  }
}

function formatDate(value?: string | null) {
  if (!value) return '尚未設定'
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(value))
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    toast.success(`${label}已複製`)
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Copy className="mr-1.5 h-3.5 w-3.5" />
      複製
    </Button>
  )
}

function ArticleListItem({
  article,
  active,
  onSelect,
}: {
  article: OfficialSiteArticle
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        active
          ? 'border-blue-400/50 bg-blue-500/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{article.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">{article.description}</p>
        </div>
        <Badge variant={statusVariant(article.status)}>{STATUS_LABELS[article.status] || article.status}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
        <span>相似度：{typeof article.similarityScore === 'number' ? `${Math.round(article.similarityScore * 100)}%` : '未檢查'}</span>
        <span>更新：{formatDate(article.updatedAt)}</span>
      </div>
    </button>
  )
}

export default function OfficialSiteContentPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { data: site } = useSite(siteId)
  const articlesQuery = useOfficialSiteArticles(siteId)
  const recommendationQuery = useOfficialArticleRecommendation(siteId)
  const generateMutation = useGenerateOfficialSiteArticle(siteId)
  const approveMutation = useApproveOfficialSiteArticle(siteId)
  const verifyMutation = useVerifyOfficialSiteArticle(siteId)

  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [topicDirection, setTopicDirection] = useState('')
  const [publishBaseUrl, setPublishBaseUrl] = useState('')
  const [slug, setSlug] = useState('')
  const [sourceArticleId, setSourceArticleId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [packageRequested, setPackageRequested] = useState(false)
  const [verifyUrl, setVerifyUrl] = useState('')
  const [showFullPreview, setShowFullPreview] = useState(false)

  const selectedArticleQuery = useOfficialSiteArticle(siteId, selectedId)
  const selectedArticle = selectedArticleQuery.data
  const qualitySummary = useMemo(
    () => selectedArticle?.qualityReport ? getQualitySummary(selectedArticle.qualityReport) : null,
    [selectedArticle?.qualityReport],
  )
  const packageQuery = useOfficialPublishPackage(siteId, selectedId, packageRequested)
  const articles = articlesQuery.data ?? []
  const recommendation = recommendationQuery.data
  const canonicalPreview = useMemo(() => {
    if (!publishBaseUrl.trim() || !slug.trim()) return ''
    return `${publishBaseUrl.replace(/\/+$/, '')}/${slug.trim()}`
  }, [publishBaseUrl, slug])

  useEffect(() => {
    if (!recommendation) return
    setTopic((value) => value || recommendation.topic)
    setAngle((value) => value || recommendation.angle)
    setPublishBaseUrl((value) => value || recommendation.publishBaseUrl)
    setSlug((value) => value || recommendation.suggestedSlug)
    setSourceArticleId((value) => value || recommendation.sourceArticleId || '')
  }, [recommendation])

  useEffect(() => {
    if (!publishBaseUrl && site?.url) setPublishBaseUrl(defaultPublishBaseUrl(site.url))
  }, [publishBaseUrl, site?.url])

  useEffect(() => {
    if (selectedArticle?.canonicalUrl) setVerifyUrl(selectedArticle.publishedUrl || selectedArticle.canonicalUrl)
  }, [selectedArticle?.canonicalUrl, selectedArticle?.publishedUrl])

  const handleGenerate = () => {
    if (!publishBaseUrl.trim() || !slug.trim()) {
      toast.error('請先確認官網發布位置與 SLUG')
      return
    }
    const normalizedTopic = topic.trim()
    if (normalizedTopic && Array.from(normalizedTopic).length < 8) {
      toast.error('主題至少需要 8 個字；也可清空主題，讓系統自動判斷')
      return
    }
    generateMutation.mutate(
      {
        topic: normalizedTopic || undefined,
        angle: angle.trim() || undefined,
        topicDirection: topicDirection.trim() || undefined,
        sourceArticleId: sourceArticleId || undefined,
        publishBaseUrl: publishBaseUrl.trim(),
        slug: slug.trim(),
      },
      {
        onSuccess: (article) => {
          setSelectedId(article.id)
          setPackageRequested(false)
          toast.success(article.status === 'draft' ? '官網專屬文章草稿已生成，請先審核' : '文章已生成，但未通過品質檢查')
        },
        onError: (error: any) => {
          toast.error(error?.response?.data?.message || error?.message || '生成失敗，請稍後再試')
        },
      },
    )
  }

  const handleChangeTopic = async () => {
    try {
      const result = await recommendationQuery.refetch()
      if (result.isError || !result.data) throw result.error || new Error('無法取得新主題')
      const next = result.data
      if (Array.from(next.topic.trim()).length < 8) throw new Error('系統推薦的主題過短')

      setSelectedId(null)
      setPackageRequested(false)
      setTopic(next.topic)
      setAngle(next.angle)
      setTopicDirection('')
      setPublishBaseUrl((value) => value || next.publishBaseUrl)
      setSlug(next.suggestedSlug)
      setSourceArticleId(next.sourceArticleId || '')
      toast.success(`已更換新主題：${next.topic}`)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || '更換主題失敗，請稍後再試')
    }
  }

  const handleApprove = () => {
    if (!selectedArticle) return
    approveMutation.mutate(selectedArticle.id, {
      onSuccess: () => {
        setPackageRequested(false)
        toast.success('文章已核准，可以取得官網內容包')
      },
      onError: (error: any) => toast.error(error?.response?.data?.message || '核准失敗，請先確認品質檢查結果'),
    })
  }

  const handleVerify = () => {
    if (!selectedArticle || !verifyUrl.trim()) {
      toast.error('請輸入客戶官網上線網址')
      return
    }
    verifyMutation.mutate(
      { articleId: selectedArticle.id, url: verifyUrl.trim() },
      {
        onSuccess: (result) => {
          toast[result.verificationReport?.passed ? 'success' : 'error'](
            result.verificationReport?.passed ? '官網內容驗證通過' : '官網已讀取，但仍有必要項目未通過',
          )
        },
        onError: (error: any) => toast.error(error?.response?.data?.message || '官網驗證失敗'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <SiteWorkspaceTabs siteId={siteId} siteName={site?.name} />
      <PageHeader
        icon={Globe2}
        title="官網專屬內容"
        description="以客戶第一方資料重新生成官網文章，與 Geovault 平台文章分開管理，避免跨站重複內容。"
      />

      <Card className="border-emerald-400/25 bg-emerald-500/[0.06]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <p className="font-semibold text-emerald-100">官網文章交付流程</p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                這裡只產生客戶官網自己的第一方文章，不複製 Geovault 平台正文，也不會自動發佈。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ['1', '系統規劃主題', '讀取品牌事實、FAQ、網站掃描與 AI 引用報告。'],
              ['2', '高品質生成', '品牌事實至少 70 分；文章需過 82 分與所有核心檢查，最多自動修正三次。'],
              ['3', '客戶發布驗收', '通過後提供 CMS 內容包，發布後再驗證 canonical、Schema 與可讀內容。'],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-lg border border-emerald-300/15 bg-black/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-300/15 text-xs font-bold text-emerald-100">{number}</span>
                  <p className="text-sm font-semibold text-emerald-50">{title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-50/65">{description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-blue-300" />
              建立官網專屬文章
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-blue-400/20 bg-blue-500/[0.06] p-4 text-sm leading-6 text-blue-50/90">
              <div className="flex items-center gap-2 font-semibold text-blue-100">
                <Sparkles className="h-4 w-4" />
                {recommendationQuery.isLoading ? 'AI 正在整理你的品牌資料…' : '系統已先替你整理文章企劃'}
              </div>
              <p className="mt-1 text-xs text-blue-100/70">
                已自動參考 Brand Facts、FAQ、近期主題、網站掃描與 AI 引用綜合檢測；你只要確認下面內容即可，不需要自己想主題。
              </p>
              {recommendation && (
                <p className="mt-2 text-xs text-blue-100/70">{recommendation.reasoning}</p>
              )}
              {recommendation && (
                <p className="mt-2 text-xs text-blue-100/60">
                  判斷依據：{recommendation.dataUsed.verifiedFacts ?? 0} 筆品牌事實、{recommendation.dataUsed.qaPairs ?? 0} 組 FAQ、{recommendation.dataUsed.scanIndicators ?? 0} 項網站掃描指標，{recommendation.dataUsed.reportAvailable ? '已納入 AI 引用綜合報告' : '目前沒有可用的 AI 引用綜合報告'}。
                </p>
              )}
              {recommendation && !recommendation.firstPartyReadiness.ready && (
                <p className="mt-2 text-xs text-amber-200">目前第一方資料完整度 {recommendation.firstPartyReadiness.confidenceScore}/{recommendation.firstPartyReadiness.minimumConfidenceScore}，請先補齊：{recommendation.firstPartyReadiness.missingFacts.join('、') || '品牌服務、對象與 FAQ'}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="official-topic-direction" className="text-sm font-medium text-gray-200">你想發展的主題方向（選填）</label>
              <Textarea
                id="official-topic-direction"
                value={topicDirection}
                onChange={(event) => setTopicDirection(event.target.value)}
                placeholder="例如：我想專門說明第一次導入企業軟體的準備流程；不填就由系統依品牌資料、網站掃描與 AI 引用報告判斷。"
                className="min-h-[78px]"
              />
              <p className="text-xs leading-5 text-gray-500">填寫後系統會先用你的方向，再檢查是否符合品牌事實、掃描問題與 AI 可引用結構。</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="official-publish-base" className="text-sm font-medium text-gray-200">官網文章發布位置</label>
              <Input
                id="official-publish-base"
                type="url"
                value={publishBaseUrl}
                onChange={(event) => setPublishBaseUrl(event.target.value)}
                placeholder="https://your-domain.com/blog"
              />
              <p className="text-xs leading-5 text-gray-500">填官網 CMS 的文章集合位置即可，不用事先知道文章完整網址。</p>
            </div>
            <details className="rounded-lg border border-white/10 bg-white/[0.02] text-xs text-gray-400">
              <summary className="cursor-pointer list-none px-3 py-3 font-medium text-gray-300 hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400">
                查看 AI 企劃與網址設定（通常不用修改）
              </summary>
              <div className="space-y-4 border-t border-white/10 p-3">
                <div className="space-y-1.5">
                  <label htmlFor="official-topic" className="text-xs text-gray-400">AI 建議文章主題</label>
                  <Input
                    id="official-topic"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="系統會從品牌 FAQ 自動帶入"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="official-angle" className="text-xs text-gray-400">AI 建議內容角度</label>
                  <Textarea
                    id="official-angle"
                    value={angle}
                    onChange={(event) => setAngle(event.target.value)}
                    placeholder="系統會依品牌服務與適用對象自動整理"
                    className="min-h-[82px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="official-slug" className="text-xs text-gray-400">英文 SLUG</label>
                  <Input
                    id="official-slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="official-article"
                  />
                  <p className="text-xs leading-5 text-gray-500">撞名時會改用另一個語意版本，不加無意義序號。網址預覽：{canonicalPreview || '等待發布位置與 SLUG'}</p>
                </div>
                <p className="leading-5">{recommendation?.sourceArticle ? `系統參考：${recommendation.sourceArticle.title}（只取標題、摘要與關鍵字，不取正文）` : '目前沒有可用的平台主題 metadata，會完全依第一方資料生成。'}</p>
              </div>
            </details>
            {recommendation && !recommendation.firstPartyReadiness.ready ? (
              <Link href={`/sites/${siteId}/knowledge`} className="block">
                <Button type="button" className="w-full bg-amber-600 text-white hover:bg-amber-700">
                  先補齊品牌資料再生成
                </Button>
              </Link>
            ) : (
              <Button
                type="button"
                className="w-full bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleGenerate}
                disabled={generateMutation.isPending || recommendationQuery.isLoading || recommendationQuery.isFetching}
              >
                {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {generateMutation.isPending ? '品質生成與檢查中…' : '生成並執行高品質檢查'}
              </Button>
            )}
            <p className="text-center text-xs text-gray-500">生成後會先進入審核，不會自動發布到客戶官網；每週平台文章流程也不會受影響。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-300" />官網專屬文章清單</span>
              <span className="text-xs font-normal text-gray-500">共 {articles.length} 篇</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {articlesQuery.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />載入中…</div>
            ) : articles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm leading-6 text-gray-400">
                尚未建立官網專屬文章。系統會先依品牌資料、網站掃描與 AI 引用報告規劃主題，你只需確認官網發布位置。
              </div>
            ) : (
              articles.map((article) => (
                <ArticleListItem
                  key={article.id}
                  article={article}
                  active={article.id === selectedId}
                  onSelect={() => { setSelectedId(article.id); setPackageRequested(false) }}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selectedArticleQuery.isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />載入文章詳情…</CardContent></Card>
      )}

      {selectedArticle && (
        <Card className="border-blue-400/20 bg-blue-500/[0.03]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg text-white">{selectedArticle.title}</CardTitle>
                <p className="mt-1 text-sm leading-6 text-gray-400">{selectedArticle.description}</p>
              </div>
              <Badge variant={statusVariant(selectedArticle.status)}>{STATUS_LABELS[selectedArticle.status] || selectedArticle.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-gray-500">內容相似度</p>
                <p className="mt-1 text-xl font-semibold text-white">{typeof selectedArticle.similarityScore === 'number' ? `${Math.round(selectedArticle.similarityScore * 100)}%` : '—'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-gray-500">預計 canonical</p>
                <p className="mt-1 truncate text-sm text-white" title={selectedArticle.canonicalUrl || undefined}>{selectedArticle.canonicalUrl || '尚未設定'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-gray-500">最後驗證</p>
                <p className="mt-1 text-sm text-white">{formatDate(selectedArticle.lastVerifiedAt)}</p>
              </div>
            </div>

            {selectedArticle.qualityReport && qualitySummary && (
              <div className="rounded-lg border border-white/10 bg-black/10 p-4">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">GEO 高品質檢查</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      核准條件＝總分達 {selectedArticle.qualityReport.minimumScore ?? 82} 分以上，且所有「必過」項目通過。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={qualitySummary.scorePassed ? 'default' : 'destructive'}>
                      總分{qualitySummary.scorePassed ? '達標' : '未達標'}：{selectedArticle.qualityReport.score ?? 0}/{selectedArticle.qualityReport.minimumScore ?? 82}
                    </Badge>
                    <Badge variant={qualitySummary.requiredPassed ? 'default' : 'destructive'}>
                      必過條件{qualitySummary.requiredPassed ? '全數通過' : `缺 ${qualitySummary.failedRequiredChecks.length} 項`}
                    </Badge>
                    <span className="text-gray-500">{selectedArticle.qualityReport.charLength} 字 · 第 {selectedArticle.qualityReport.finalAttempt ?? selectedArticle.qualityReport.attempts ?? 1} 次</span>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(selectedArticle.qualityReport.checks).map(([key, passed]) => (
                    <div key={key} className="flex items-center gap-2 text-xs text-gray-300">
                      {passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                      <span>{CHECK_LABELS[key] || key}</span>
                      {qualitySummary.requiredChecks.has(key) && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${passed ? 'bg-white/5 text-gray-500' : 'bg-red-400/10 text-red-200'}`}>
                          必過
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {!selectedArticle.qualityReport.passed && (
                  <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-100">
                    <p className="font-semibold">
                      {qualitySummary.scorePassed
                        ? `總分已達標，但仍有 ${qualitySummary.failedRequiredChecks.length} 項必過條件未通過，因此不能交付。`
                        : `總分尚未達 ${selectedArticle.qualityReport.minimumScore ?? 82} 分，因此不能交付。`}
                    </p>
                    {qualitySummary.failedRequiredChecks.length > 0 && (
                      <p className="mt-1">必須修正：{qualitySummary.failedRequiredChecks.map((key) => CHECK_LABELS[key] || key).join('、')}</p>
                    )}
                    {(selectedArticle.qualityReport.unsupportedPromiseClaims?.length || 0) > 0 && (
                      <p className="mt-1">偵測到的違規原句：{selectedArticle.qualityReport.unsupportedPromiseClaims?.join('；')}</p>
                    )}
                    {qualitySummary.advisoryFailedChecks.length > 0 && (
                      <p className="mt-1 text-amber-100/70">其他待優化：{qualitySummary.advisoryFailedChecks.map((key) => CHECK_LABELS[key] || key).join('、')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedArticle.status === 'quality_failed' && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/90">
                這篇文章已經過最多三次自動優化仍未達到 GEO 高品質門檻，目前不能核准，也不會提供給客戶貼到官網。建議換一個主題方向，或補充品牌第一方資料後再生成。
                <div className="mt-3">
                  <Button type="button" variant="outline" onClick={handleChangeTopic} disabled={recommendationQuery.isFetching}>
                    {recommendationQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    換一個主題
                  </Button>
                </div>
              </div>
            )}

            {selectedArticle.content && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">正式文章排版預覽</p>
                    <p className="mt-1 text-xs text-gray-500">標題、粗體、清單與段落已轉為讀者實際看到的格式，不顯示 Markdown 符號。</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowFullPreview((value) => !value)}>
                    {showFullPreview ? '收合' : '查看全文'}
                  </Button>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] p-5 sm:p-7">
                  <div className={showFullPreview ? '' : 'max-h-80 overflow-hidden'}>
                    <MarkdownArticlePreview markdown={selectedArticle.content} />
                  </div>
                  {!showFullPreview && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b1220] to-transparent" />}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selectedArticle.status === 'draft' && (
                <Button type="button" onClick={handleApprove} disabled={approveMutation.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  核准官網專屬文章
                </Button>
              )}
              {selectedArticle.status === 'export_ready' && (
                <Button type="button" onClick={() => setPackageRequested(true)} disabled={packageQuery.isFetching} className="bg-blue-600 text-white hover:bg-blue-700">
                  {packageQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  取得官網內容包
                </Button>
              )}
            </div>

            {packageQuery.data && (
              <div className="space-y-4 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.04] p-4">
                <div>
                  <p className="font-semibold text-emerald-100">官網內容包已準備完成</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">這是獨立生成的官網版本，不是 Geovault 平台文章。一般 CMS 請優先使用「CMS HTML」，不要把 Markdown 原始符號直接貼進視覺編輯器。</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <p className="mb-3 text-xs font-semibold text-gray-300">交付排版預覽</p>
                    <div className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-[#0b1220] p-5">
                      <MarkdownArticlePreview markdown={packageQuery.data.formats.markdown} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-blue-400/20 bg-blue-500/[0.05] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-blue-100">CMS HTML（一般官網建議使用）</p>
                        <p className="mt-1 text-[11px] leading-5 text-blue-100/60">貼到 WordPress 自訂 HTML、Webflow Embed 或 CMS 原始碼模式，標題與段落會正常排版。</p>
                      </div>
                      <CopyButton label="CMS HTML" value={packageQuery.data.formats.cmsHtml} />
                    </div>
                  </div>
                  <details className="rounded-lg border border-white/10 bg-black/20 text-xs text-gray-400">
                    <summary className="cursor-pointer px-3 py-3 font-medium text-gray-300">CMS 支援 Markdown 時才使用 Markdown 原始碼</summary>
                    <div className="space-y-3 border-t border-white/10 p-3">
                      <div className="flex items-center justify-between gap-3"><p className="font-semibold text-gray-300">Markdown 原始碼</p><CopyButton label="Markdown" value={packageQuery.data.formats.markdown} /></div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-6 text-gray-300">{packageQuery.data.formats.markdown}</pre>
                    </div>
                  </details>
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-gray-300">SEO Meta / Canonical / Open Graph</p><CopyButton label="Meta Tags" value={packageQuery.data.formats.metaTags} /></div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-6 text-gray-300">{packageQuery.data.formats.metaTags}</pre>
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-gray-300">Article / FAQ JSON-LD</p><CopyButton label="JSON-LD" value={packageQuery.data.formats.jsonLd} /></div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-6 text-gray-300">{packageQuery.data.formats.jsonLd}</pre>
                </div>
              </div>
            )}

            {selectedArticle.status === 'export_ready' && (
              <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-semibold text-white">客戶上線後驗證</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">系統會讀取正式 HTML，檢查正文、canonical、Article JSON-LD、FAQ Schema、OG 與 noindex 狀態。</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={verifyUrl} onChange={(event) => setVerifyUrl(event.target.value)} placeholder="https://your-domain.com/blog/your-article" />
                  <Button type="button" variant="outline" onClick={handleVerify} disabled={verifyMutation.isPending} className="shrink-0">
                    {verifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />}
                    驗證正式網址
                  </Button>
                </div>
                {selectedArticle.lastVerifiedAt && <p className="text-xs text-gray-500">上次驗證：{formatDate(selectedArticle.lastVerifiedAt)}；結果請查看文章狀態資料。</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
