'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Code2,
  ExternalLink,
  FileDown,
  LifeBuoy,
  Loader2,
  PlugZap,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useCompletionReport,
  useEngineerHandoff,
  useGuidedFixPlan,
  type GuidedIssue,
  type HandoffFile,
} from '@/hooks/use-guided-fix'

function statusClass(status: string) {
  if (status === 'pass') return 'bg-green-500/20 text-green-300'
  if (status === 'warning') return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-red-500/20 text-red-300'
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  toast.success('已複製')
}

function IssueRow({ issue }: { issue: GuidedIssue }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-white">{issue.label}</p>
          <Badge className={statusClass(issue.status)}>{issue.status}</Badge>
          {issue.canAutoFix ? (
            <Badge variant="outline">可一鍵處理</Badge>
          ) : (
            <Badge variant="outline">需人工確認</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{issue.whyItMatters}</p>
        <p className="text-sm text-blue-200">{issue.nextStep}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm text-muted-foreground">預估提升</p>
        <p className="text-xl font-semibold text-white">+{issue.estimatedGain}</p>
      </div>
    </div>
  )
}

function FileBlock({ file }: { file: HandoffFile }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-300" />
            <p className="font-medium text-white">{file.path}</p>
            <Badge variant="outline">{file.language}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{file.purpose}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
            {open ? '收合' : '預覽'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => copyText(file.content)}>
            <Clipboard className="mr-2 h-4 w-4" />
            複製
          </Button>
        </div>
      </div>
      {open ? (
        <pre className="max-h-96 overflow-auto border-t border-white/10 p-4 text-xs text-gray-200">
          {file.content}
        </pre>
      ) : null}
    </div>
  )
}

export default function GuidedFixPage() {
  const params = useParams()
  const rawSiteId = params.siteId as string
  const isPlaceholderSiteId = !rawSiteId || rawSiteId.includes('{') || rawSiteId.includes('}')
  const siteId = isPlaceholderSiteId ? '' : rawSiteId
  const { data: plan, isLoading: planLoading, error: planError } = useGuidedFixPlan(siteId)
  const { data: handoff, isLoading: handoffLoading } = useEngineerHandoff(siteId)
  const { data: report, isLoading: reportLoading } = useCompletionReport(siteId)
  const [activeTab, setActiveTab] = useState('quick-wins')

  useEffect(() => {
    if (window.location.hash === '#handoff') {
      setActiveTab('handoff')
      window.setTimeout(() => {
        document.getElementById('handoff')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [])

  const handoffText = useMemo(() => {
    if (!handoff) return ''
    return handoff.files
      .map((file) => `# ${file.path}\n${file.purpose}\n\n${file.content}`)
      .join('\n\n---\n\n')
  }, [handoff])

  if (isPlaceholderSiteId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-blue-300" />
          <h2 className="text-lg font-semibold text-white">請先選擇一個網站</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            這個頁面的網址需要真實網站 ID，不能使用 {'{siteId}'} placeholder。
          </p>
          <Link href="/sites">
            <Button className="mt-4">
              前往網站列表
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (planLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (planError || !plan) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-white">還沒有可用的導引方案</h2>
          <p className="mt-1 text-sm text-muted-foreground">請先完成一次網站掃描，再回來查看最快修復路徑。</p>
          <Link href={`/sites/${siteId}`}>
            <Button className="mt-4" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回網站詳情
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/sites/${siteId}`}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-white"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回網站詳情
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-blue-300" />
              <h1 className="text-2xl font-bold text-white">最快 GEO 提升方案</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              不需要先理解技術名詞。這裡只列出最短路徑：能一鍵處理的先做，不能自動處理的再交給工程師或代裝。
            </p>
          </div>
          <a href={plan.site.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              開啟網站
            </Button>
          </a>
        </div>
      </div>

      <Card className="border-blue-500/30 bg-blue-500/10">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <Badge className="mb-3 bg-blue-500/20 text-blue-200">建議第一步</Badge>
            <h2 className="text-2xl font-bold text-white">{plan.headline.title}</h2>
            <p className="mt-2 text-sm text-blue-100">
              預估 {plan.headline.estimatedMinutes} 分鐘完成 {plan.headline.quickWinCount} 個可修復項目。
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-blue-200">目前分數</p>
                <p className="text-3xl font-semibold text-white">{plan.headline.currentScore}</p>
              </div>
              <div>
                <p className="text-sm text-blue-200">預估提升後</p>
                <p className="text-3xl font-semibold text-white">{plan.headline.estimatedScore}</p>
              </div>
              <div>
                <p className="text-sm text-blue-200">剩餘人工項目</p>
                <p className="text-3xl font-semibold text-white">{plan.headline.manualCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-blue-100">分數路徑</span>
              <span className="text-sm font-medium text-white">
                {plan.headline.currentScore} → {plan.headline.estimatedScore}
              </span>
            </div>
            <Progress value={plan.headline.currentScore} className="h-3 bg-white/10" />
            <Progress value={plan.headline.estimatedScore} className="mt-3 h-3 bg-white/10" />
            <div className="mt-4 space-y-2 text-sm text-blue-100">
              {plan.paymentTrigger.bullets.map((bullet) => (
                <div key={bullet} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-300" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {plan.paths.map((path) => (
          <Card key={path.key} className={path.recommended ? 'border-blue-500/40 bg-blue-500/10' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{path.title}</CardTitle>
                {path.recommended ? <Badge className="bg-blue-500/20 text-blue-200">推薦</Badge> : null}
              </div>
              <CardDescription>{path.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">投入時間：{path.effort}</p>
              {path.key === 'engineer' ? (
                <Button
                  className="w-full"
                  variant={path.recommended ? 'default' : 'outline'}
                  onClick={() => {
                    setActiveTab('handoff')
                    window.setTimeout(() => {
                      document.getElementById('handoff')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 0)
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {path.cta}
                </Button>
              ) : (
                <Link href={path.href}>
                  <Button className="w-full" variant={path.recommended ? 'default' : 'outline'}>
                    {path.key === 'wordpress' ? <PlugZap className="mr-2 h-4 w-4" /> : <LifeBuoy className="mr-2 h-4 w-4" />}
                    {path.cta}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="quick-wins">可立即修復</TabsTrigger>
          <TabsTrigger value="handoff">工程師修復包</TabsTrigger>
          <TabsTrigger value="report">完成報告</TabsTrigger>
        </TabsList>

        <TabsContent value="quick-wins" className="space-y-4">
          {plan.quickWins.map((issue) => (
            <IssueRow key={issue.indicator} issue={issue} />
          ))}
          {plan.manualItems.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">需要人工確認的項目</CardTitle>
                <CardDescription>這些項目通常需要調整網站內容或 robots.txt，適合交給工程師或代裝處理。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.manualItems.map((issue) => (
                  <IssueRow key={issue.indicator} issue={issue} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="handoff" id="handoff" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>交給工程師的安裝包</CardTitle>
                  <CardDescription>直接複製給工程師，照清單貼上後重新掃描。</CardDescription>
                </div>
                <Button
                  variant="outline"
                  disabled={!handoff || handoffLoading}
                  onClick={() => copyText(handoffText)}
                >
                  {handoffLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clipboard className="mr-2 h-4 w-4" />}
                  複製整包
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {handoffLoading || !handoff ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">目前分數</p>
                      <p className="text-2xl font-semibold">{handoff.summary.currentScore}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">預估完成後</p>
                      <p className="text-2xl font-semibold">{handoff.summary.estimatedScore}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">工程時間</p>
                      <p className="text-2xl font-semibold">{handoff.summary.installTime}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="mb-2 font-medium">安裝步驟</p>
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                      {handoff.instructions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </div>
                  {handoff.files.map((file) => (
                    <FileBlock key={file.path} file={file} />
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>修復後完成報告</CardTitle>
              <CardDescription>重新掃描後，這裡會顯示分數變化、已解決項目與剩餘下一步。</CardDescription>
            </CardHeader>
            <CardContent>
              {reportLoading || !report ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">最新分數</p>
                      <p className="text-3xl font-semibold">{report.latestScan.score}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">和上次相比</p>
                      <p className={report.scoreDelta >= 0 ? 'text-3xl font-semibold text-green-300' : 'text-3xl font-semibold text-red-300'}>
                        {report.scoreDelta >= 0 ? '+' : ''}{report.scoreDelta}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm text-muted-foreground">AI 爬蟲紀錄</p>
                      <p className="text-3xl font-semibold">{report.crawlerVisits.length}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {report.verification.map((item) => (
                      <div key={item.key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <span>{item.label}</span>
                        {item.passed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-300" />
                        ) : (
                          <XCircle className="h-5 w-5 text-yellow-300" />
                        )}
                      </div>
                    ))}
                  </div>
                  {report.remaining.length > 0 ? (
                    <div className="space-y-3">
                      <p className="font-medium">下一步</p>
                      {report.remaining.slice(0, 3).map((issue) => (
                        <IssueRow key={issue.indicator} issue={issue} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-200">
                      目前沒有主要剩餘修復項目。
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
