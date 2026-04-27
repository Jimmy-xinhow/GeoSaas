'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ArrowLeft, Copy, RefreshCw, FileText } from 'lucide-react'
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

export default function ContentNewPage() {
  const router = useRouter()
  const generateContent = useGenerateContent()

  const [contentType, setContentType] = useState('faq')
  const [language, setLanguage] = useState('zh-TW')
  const [brandName, setBrandName] = useState('')
  const [industry, setIndustry] = useState('')
  const [keywords, setKeywords] = useState('')

  // Store the generated content result
  const [generatedResult, setGeneratedResult] = useState<{
    id: string
    title: string
    body: string
    type: string
  } | null>(null)

  // Map frontend content type values to backend enum
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

  const handleGenerate = () => {
    // Validate required fields
    if (!brandName.trim()) {
      toast.error('請輸入品牌名稱')
      return
    }

    const keywordArray = keywords
      .split(/[,，]/)
      .map((k) => k.trim())
      .filter(Boolean)

    if (keywordArray.length === 0) {
      toast.error('請至少輸入一個關鍵字')
      return
    }

    // Clear previous result
    setGeneratedResult(null)

    generateContent.mutate(
      {
        type: mapContentType(contentType),
        brandName: brandName.trim(),
        industry: industry.trim() || undefined,
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
          toast.success('內容生成完成！')
        },
        onError: (error: any) => {
          const message =
            error?.response?.data?.message || error?.message || '生成失敗，請稍後再試'
          toast.error(`生成失敗：${message}`)
        },
      }
    )
  }

  const handleCopyToClipboard = async () => {
    if (!generatedResult?.body) return
    try {
      await navigator.clipboard.writeText(generatedResult.body)
      toast.success('已複製到剪貼簿')
    } catch {
      toast.error('複製失敗')
    }
  }

  const handleNavigateToDetail = () => {
    if (generatedResult?.id) {
      router.push(`/content`)
    }
  }

  const resultDescription =
    contentType === 'faq'
      ? 'FAQ JSON-LD 結構化資料'
      : contentType === 'article'
        ? 'Markdown 權威文章'
        : '品牌知識庫內容'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">AI 內容生成</h1>
        <p className="text-muted-foreground mt-1">
          使用 AI 自動生成 GEO 優化的品牌內容
        </p>
      </div>

      {/* Two-column layout: form on the left, live preview on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left column — Steps 1 & 2 */}
        <div className="space-y-6 min-w-0">
          {/* Step 1: Content type selector */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              步驟 1：選擇內容類型
            </h3>
            <ContentTypeSelector value={contentType} onChange={setContentType} />
          </div>

          {/* Step 2: Form */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              步驟 2：填寫品牌資訊
            </h3>
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle>品牌資訊</CardTitle>
                <CardDescription>
                  提供品牌相關資訊，AI 將根據這些資訊生成優化內容
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand">品牌名稱</Label>
                    <Input
                      id="brand"
                      placeholder="例如：TechFlow"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      disabled={generateContent.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">行業</Label>
                    <Input
                      id="industry"
                      placeholder="例如：科技 / SaaS"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      disabled={generateContent.isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">關鍵字（逗號分隔）</Label>
                  <Input
                    id="keywords"
                    placeholder="例如：AI, 數位轉型, 雲端服務, SaaS"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    disabled={generateContent.isPending}
                  />
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
                      <SelectItem value="zh-TW">中文（繁體）</SelectItem>
                      <SelectItem value="zh-CN">中文（簡體）</SelectItem>
                      <SelectItem value="en">英文</SelectItem>
                      <SelectItem value="ja">日文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerate}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  disabled={generateContent.isPending}
                >
                  {generateContent.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      AI 正在生成內容...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      開始生成
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right column — preview / loading / empty state */}
        <div className="lg:sticky lg:top-6 min-w-0">
          {generatedResult ? (
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  AI 生成結果
                </CardTitle>
                <CardDescription>{resultDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-sm text-muted-foreground">
                  標題：{generatedResult.title}
                </div>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed max-h-[60vh] overflow-y-auto">
                  <code>{generatedResult.body}</code>
                </pre>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button
                    onClick={handleNavigateToDetail}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    返回內容列表
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
                  <p className="font-medium text-blue-300">AI 正在生成內容…</p>
                  <p className="text-sm text-blue-400 mt-1">
                    通常需要 10–30 秒，請稍候
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-white/10 bg-white/[0.02]">
              <CardContent className="flex flex-col items-center justify-center text-center gap-3 min-h-[60vh] py-10 text-gray-400">
                <FileText className="h-12 w-12 text-gray-600" />
                <div>
                  <p className="font-medium">生成結果會出現在這裡</p>
                  <p className="text-sm text-gray-500 mt-1">
                    在左側填寫品牌資訊後按「開始生成」
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
