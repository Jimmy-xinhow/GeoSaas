'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ContentTypeSelector from '@/components/content/content-type-selector'
import { useGenerateContent } from '@/hooks/use-content'
import { useBrandFactReadiness, useSites } from '@/hooks/use-sites'
import { useKnowledge } from '@/hooks/use-knowledge'

export default function ContentNewPage() {
  const router = useRouter()
  const generateContent = useGenerateContent()
  const { data: sites = [], isLoading: isSitesLoading } = useSites()

  const [contentType, setContentType] = useState('faq')
  const [language, setLanguage] = useState('zh-TW')
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [keywords, setKeywords] = useState('')
  const [generatedResult, setGeneratedResult] = useState<{
    id: string
    title: string
    body: string
    type: string
  } | null>(null)

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId),
    [selectedSiteId, sites]
  )
  const { data: knowledge = [] } = useKnowledge(selectedSiteId)
  const { data: readiness } = useBrandFactReadiness(selectedSiteId)

  useEffect(() => {
    if (!selectedSiteId && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
    }
  }, [selectedSiteId, sites])

  const mapContentType = (frontendType: string): 'FAQ' | 'ARTICLE' => {
    switch (frontendType) {
      case 'faq':
        return 'FAQ'
      case 'article':
      case 'knowledge':
      default:
        return 'ARTICLE'
    }
  }

  const keywordArray = useMemo(
    () =>
      keywords
        .split(/[,，、\n]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    [keywords]
  )

  const handleGenerate = () => {
    if (!selectedSiteId) {
      toast.error('請先選擇要產生內容的品牌網站')
      return
    }

    setGeneratedResult(null)

    generateContent.mutate(
      {
        type: mapContentType(contentType),
        siteId: selectedSiteId,
        keywords: keywordArray,
        language,
      },
      {
        onSuccess: (data) => {
          setGeneratedResult({
            id: data.id,
            title: data.title,
            body: data.body || '',
            type: data.type,
          })
          toast.success('內容已產生，並已存成草稿')
        },
        onError: (error: any) => {
          const response = error?.response?.data
          const message =
            typeof response?.message === 'string'
              ? response.message
              : error?.message || '產生失敗，請稍後再試'
          const missingFields = Array.isArray(response?.missingFields)
            ? `缺少：${response.missingFields.join('、')}`
            : ''
          toast.error(`產生失敗：${message}`)
          if (missingFields) toast.error(missingFields)
        },
      }
    )
  }

  const handleCopyToClipboard = async () => {
    if (!generatedResult?.body) return
    try {
      await navigator.clipboard.writeText(generatedResult.body)
      toast.success('內容已複製')
    } catch {
      toast.error('複製失敗')
    }
  }

  const resultDescription =
    contentType === 'faq'
      ? '根據品牌知識庫產生的 GEO FAQ'
      : '根據品牌知識庫產生的 GEO 友善文章'

  const profile = selectedSite?.profile
  const readinessFacts = readiness?.verifiedFacts?.slice(0, 3) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI 內容生成</h1>
        <p className="text-muted-foreground mt-1">
          內容會綁定你的品牌網站與知識庫，不需要手動填品牌資料。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              步驟 1：選擇內容類型
            </h3>
            <ContentTypeSelector value={contentType} onChange={setContentType} />
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              步驟 2：綁定品牌知識庫
            </h3>
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle>品牌資料來源</CardTitle>
                <CardDescription>
                  AI 只會使用你已建立的網站、品牌設定與知識庫 Q&A 產生內容。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>選擇品牌網站</Label>
                  <Select
                    value={selectedSiteId}
                    onValueChange={setSelectedSiteId}
                    disabled={generateContent.isPending || isSitesLoading || sites.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isSitesLoading ? '載入網站中...' : '選擇網站'} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSite ? (
                  <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm text-gray-300 space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">品牌</span>
                      <span className="text-right text-white">{selectedSite.name}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">網站</span>
                      <span className="text-right break-all">{selectedSite.url}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">產業</span>
                      <span className="text-right">{profile?.industry || '尚未設定'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">知識庫</span>
                      <span className="text-right">{knowledge.length} 組 Q&A</span>
                    </div>
                    {readinessFacts.length > 0 && (
                      <div className="pt-2 border-t border-white/10">
                        <p className="text-gray-400 mb-2">已驗證事實</p>
                        <ul className="space-y-1">
                          {readinessFacts.map((fact) => (
                            <li key={fact}>- {fact}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    目前沒有可用網站。請先新增網站與品牌知識庫，再使用內容引擎。
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="keywords">生成重點（選填）</Label>
                  <Input
                    id="keywords"
                    placeholder="例如：GEO 優化、AI 搜尋能見度、品牌 FAQ"
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    disabled={generateContent.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    不填也可以，系統會從品牌設定與知識庫自動整理重點。
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>語言</Label>
                  <Select
                    value={language}
                    onValueChange={setLanguage}
                    disabled={generateContent.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇語言" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-TW">繁體中文</SelectItem>
                      <SelectItem value="zh-CN">簡體中文</SelectItem>
                      <SelectItem value="en">英文</SelectItem>
                      <SelectItem value="ja">日文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerate}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={generateContent.isPending || !selectedSiteId}
                >
                  {generateContent.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      AI 正在產生內容...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      產生內容
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 min-w-0">
          {generatedResult ? (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  AI 生成結果
                </CardTitle>
                <CardDescription>{resultDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-sm text-muted-foreground">
                  標題：{generatedResult.title}
                </div>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                  <code>{generatedResult.body}</code>
                </pre>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button
                    onClick={() => router.push('/content')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    回內容列表
                  </Button>
                  <Button variant="outline" onClick={handleCopyToClipboard}>
                    <Copy className="h-4 w-4 mr-2" />
                    複製
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={generateContent.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重新生成
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : generateContent.isPending ? (
            <Card className="border-blue-500/30 bg-blue-500/10">
              <CardContent className="flex flex-col items-center justify-center text-center gap-4 min-h-[60vh] py-10">
                <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
                <div>
                  <p className="font-medium text-blue-300">AI 正在整理品牌知識庫</p>
                  <p className="text-sm text-blue-400 mt-1">
                    生成會以已選網站的資料為依據，通常需要 10 到 30 秒。
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-white/10 bg-white/[0.02]">
              <CardContent className="flex flex-col items-center justify-center text-center gap-3 min-h-[60vh] py-10 text-gray-400">
                <FileText className="h-12 w-12 text-gray-600" />
                <div>
                  <p className="font-medium">生成結果會顯示在這裡</p>
                  <p className="text-sm text-gray-500 mt-1">
                    選擇品牌網站後，系統會自動帶入知識庫內容。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
