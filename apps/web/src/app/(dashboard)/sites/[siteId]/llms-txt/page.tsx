'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Sparkles,
  Save,
  Copy,
  Check,
  Loader2,
  ExternalLink,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSite } from '@/hooks/use-sites'
import {
  useLlmsTxt,
  useUpdateLlmsTxt,
  useGenerateLlmsTxtHosting,
} from '@/hooks/use-llms-hosting'

export default function LlmsTxtPage() {
  const params = useParams()
  const siteId = params.siteId as string

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: llmsData, isLoading: llmsLoading } = useLlmsTxt(siteId)
  const updateMutation = useUpdateLlmsTxt()
  const generateMutation = useGenerateLlmsTxtHosting()

  const [content, setContent] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (llmsData?.content) {
      setContent(llmsData.content)
    }
  }, [llmsData])

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  const hostedUrl = `${apiUrl}/api/llms/${siteId}/llms.txt`

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ siteId, content })
      toast.success('llms.txt 已儲存')
    } catch {
      toast.error('儲存失敗')
    }
  }

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync(siteId)
      setContent(result.content)
      toast.success('AI 已自動生成 llms.txt 內容')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '生成失敗')
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('已複製到剪貼簿')
    setTimeout(() => setCopied(false), 2000)
  }

  if (siteLoading || llmsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">找不到網站</h2>
        <Link href="/sites">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回網站列表
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/sites/${siteId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回網站詳情
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-white">llms.txt 託管</h1>
              <p className="text-muted-foreground mt-1">
                {site.name} — 管理您的 llms.txt 檔案
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              AI 生成
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              儲存
            </Button>
          </div>
        </div>
      </div>

      {/* Hosted URL */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">託管網址</CardTitle>
          <CardDescription>此為您的 llms.txt 公開託管網址</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg">
            <code className="text-sm flex-1 text-blue-600 truncate">
              {hostedUrl}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(hostedUrl)}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Editor + Preview */}
      <Tabs defaultValue="editor" className="w-full">
        <TabsList>
          <TabsTrigger value="editor">編輯器</TabsTrigger>
          <TabsTrigger value="preview">預覽</TabsTrigger>
          <TabsTrigger value="install">安裝指南</TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[400px] p-4 font-mono text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="# 您的網站名稱&#10;&#10;> 網站描述&#10;&#10;Website: https://example.com&#10;&#10;## Important Pages&#10;&#10;- [關於我們](https://example.com/about)"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <pre className="w-full h-[400px] p-4 bg-white/5 rounded-lg overflow-auto whitespace-pre-wrap text-sm font-mono">
                {content || '(尚無內容)'}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="install">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-base">安裝方式</CardTitle>
              <CardDescription>
                選擇最適合您的方式來啟用 llms.txt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Method 1 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">
                  方式一：連結到託管 URL（推薦）
                </h4>
                <p className="text-xs text-muted-foreground">
                  在您網站的 HTML &lt;head&gt; 中加入以下 meta 標籤
                </p>
                <div className="relative">
                  <pre className="p-3 bg-white/5 rounded-lg text-xs font-mono overflow-x-auto">
{`<meta name="llms-txt" content="${hostedUrl}" />`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1"
                    onClick={() =>
                      handleCopy(
                        `<meta name="llms-txt" content="${hostedUrl}" />`,
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Method 2 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">
                  方式二：放置在 /.well-known/ 目錄
                </h4>
                <p className="text-xs text-muted-foreground">
                  將上方編輯器的內容複製後，儲存為 /.well-known/llms.txt
                </p>
                <div className="p-3 bg-white/5 rounded-lg text-xs font-mono">
                  您的網站根目錄/.well-known/llms.txt
                </div>
              </div>

              {/* Method 3 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">
                  方式三：放置在網站根目錄
                </h4>
                <p className="text-xs text-muted-foreground">
                  將內容存為 /llms.txt，放在網站的根目錄下
                </p>
                <div className="p-3 bg-white/5 rounded-lg text-xs font-mono">
                  您的網站根目錄/llms.txt
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
