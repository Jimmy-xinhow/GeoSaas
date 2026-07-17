'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, FileText, Globe2, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { useSite } from '@/hooks/use-sites'
import {
  useApproveOfficialSiteArticle,
  useGenerateOfficialSiteArticle,
  useOfficialArticleSources,
  useOfficialPublishPackage,
  useOfficialSiteArticle,
  useOfficialSiteArticles,
  useVerifyOfficialSiteArticle,
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
  includesBrandName: '包含品牌名稱',
  noPlaceholders: '沒有待補資料或佔位符',
  noPlatformReferences: '沒有平台內容字樣',
  belowDuplicateThreshold: '與既有內容相似度低於門檻',
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'quality_failed') return 'destructive'
  if (status === 'export_ready') return 'default'
  if (status === 'draft') return 'secondary'
  return 'outline'
}

function defaultCanonical(siteUrl?: string) {
  if (!siteUrl) return ''
  try {
    return `${new URL(siteUrl).origin}/blog/official-article`
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
  const sourcesQuery = useOfficialArticleSources(siteId)
  const generateMutation = useGenerateOfficialSiteArticle(siteId)
  const approveMutation = useApproveOfficialSiteArticle(siteId)
  const verifyMutation = useVerifyOfficialSiteArticle(siteId)

  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [canonicalUrl, setCanonicalUrl] = useState('')
  const [sourceArticleId, setSourceArticleId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [packageRequested, setPackageRequested] = useState(false)
  const [verifyUrl, setVerifyUrl] = useState('')
  const [showFullPreview, setShowFullPreview] = useState(false)

  const selectedArticleQuery = useOfficialSiteArticle(siteId, selectedId)
  const selectedArticle = selectedArticleQuery.data
  const packageQuery = useOfficialPublishPackage(siteId, selectedId, packageRequested)
  const articles = articlesQuery.data ?? []
  const sources = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data])

  useEffect(() => {
    if (!canonicalUrl && site?.url) setCanonicalUrl(defaultCanonical(site.url))
  }, [canonicalUrl, site?.url])

  useEffect(() => {
    if (selectedArticle?.canonicalUrl) setVerifyUrl(selectedArticle.publishedUrl || selectedArticle.canonicalUrl)
  }, [selectedArticle?.canonicalUrl, selectedArticle?.publishedUrl])

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === sourceArticleId),
    [sourceArticleId, sources],
  )

  const handleGenerate = () => {
    if (!topic.trim() || !canonicalUrl.trim()) {
      toast.error('請填寫文章主題與預計 canonical URL')
      return
    }
    generateMutation.mutate(
      {
        topic: topic.trim(),
        angle: angle.trim() || undefined,
        sourceArticleId: sourceArticleId || undefined,
        canonicalUrl: canonicalUrl.trim(),
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
        <CardContent className="space-y-2 p-5 text-sm leading-6 text-emerald-50/90">
          <p className="flex items-center gap-2 font-semibold text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            這裡產生的是客戶官網自己的文章，不是平台文章複製版
          </p>
          <p>
            平台文章只會提供主題方向與問題 metadata，正文不會送進這個生成流程。系統會用 Brand Facts、官網知識庫與已確認的第一方資料重新寫作，並在提供內容包前執行相似度檢查。
          </p>
          <p className="text-emerald-100/70">客戶不需要修改後端程式碼；通過審核後，將內容貼到原本使用的 CMS 即可。</p>
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
            <div className="space-y-1.5">
              <label htmlFor="official-topic" className="text-sm text-gray-300">文章主題或客戶問題</label>
              <Input
                id="official-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="例如：第一次導入企業軟體前，管理者應該準備哪些資料？"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="official-angle" className="text-sm text-gray-300">官網角度（選填）</label>
              <Textarea
                id="official-angle"
                value={angle}
                onChange={(event) => setAngle(event.target.value)}
                placeholder="例如：說明適合哪些企業、服務範圍與不適用情境"
                className="min-h-[82px]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="official-canonical" className="text-sm text-gray-300">預計官網文章網址（canonical）</label>
              <Input
                id="official-canonical"
                type="url"
                value={canonicalUrl}
                onChange={(event) => setCanonicalUrl(event.target.value)}
                placeholder="https://your-domain.com/blog/your-article"
              />
              <p className="text-xs leading-5 text-gray-500">必須是客戶官方網域；之後客戶實際上線網址可再進行驗證。</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="official-source" className="text-sm text-gray-300">主題靈感來源（選填）</label>
              <select
                id="official-source"
                value={sourceArticleId}
                onChange={(event) => setSourceArticleId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">不指定，直接依第一方資料規劃</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>{source.title}</option>
                ))}
              </select>
              {selectedSource && (
                <p className="text-xs leading-5 text-gray-500">只使用這篇平台文章的主題 metadata，不會使用它的正文。</p>
              )}
            </div>
            <Button
              type="button"
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {generateMutation.isPending ? '生成中…' : '生成官網專屬文章'}
            </Button>
            <p className="text-center text-xs text-gray-500">生成後會先進入審核，不會自動發布到客戶官網。</p>
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
                尚未建立官網專屬文章。先補齊品牌資料與知識庫，再從左側輸入第一個主題。
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

            {selectedArticle.qualityReport && (
              <div className="rounded-lg border border-white/10 bg-black/10 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">內容安全檢查</p>
                  <span className="text-xs text-gray-500">{selectedArticle.qualityReport.charLength} 字</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(selectedArticle.qualityReport.checks).map(([key, passed]) => (
                    <div key={key} className="flex items-center gap-2 text-xs text-gray-300">
                      {passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                      {CHECK_LABELS[key] || key}
                    </div>
                  ))}
                </div>
                {!selectedArticle.qualityReport.passed && selectedArticle.rejectionReason && (
                  <p className="mt-3 text-xs leading-5 text-amber-200">未通過原因：{selectedArticle.rejectionReason}</p>
                )}
              </div>
            )}

            {selectedArticle.status === 'quality_failed' && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/90">
                這篇文章目前不能核准，也不會提供給客戶貼到官網。請調整主題或第一方資料後重新生成。
              </div>
            )}

            {selectedArticle.content && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">文章預覽</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowFullPreview((value) => !value)}>
                    {showFullPreview ? '收合' : '查看全文'}
                  </Button>
                </div>
                <pre className={`whitespace-pre-wrap text-sm leading-7 text-gray-300 ${showFullPreview ? '' : 'max-h-48 overflow-hidden'}`}>{selectedArticle.content}</pre>
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
                  <p className="mt-1 text-xs leading-5 text-emerald-50/70">這是獨立生成的官網版本，不是 Geovault 平台文章。請貼到客戶 CMS，完成後再回到下方驗證正式網址。</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-gray-300">Markdown 正文</p><CopyButton label="Markdown" value={packageQuery.data.formats.markdown} /></div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-6 text-gray-300">{packageQuery.data.formats.markdown}</pre>
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
