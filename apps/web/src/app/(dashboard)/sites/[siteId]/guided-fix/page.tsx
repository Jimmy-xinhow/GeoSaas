'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Code2,
  ExternalLink,
  FileDown,
  FileText,
  LifeBuoy,
  Loader2,
  PlugZap,
  RefreshCw,
  SearchCheck,
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
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import {
  useCompletionReport,
  useEngineerHandoff,
  useGuidedFixPlan,
  type GuidedIssue,
  type HandoffFile,
} from '@/hooks/use-guided-fix'
import { useCmsFixStatus } from '@/hooks/use-cms-fix'

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

function issueAction(issue: GuidedIssue, siteId: string) {
  const actions: Record<string, { href: string; label: string }> = {
    llms_txt: { href: `/sites/${siteId}/llms-txt`, label: '更新 llms.txt' },
    json_ld: { href: `/sites/${siteId}/cms-fix`, label: '回 CMS 修復' },
    faq_schema: { href: `/sites/${siteId}/knowledge`, label: '補 Q&A' },
    og_tags: { href: `/sites/${siteId}/fix`, label: '開啟修復工具' },
    meta_description: { href: `/sites/${siteId}#brand-facts`, label: '補品牌描述' },
    title_optimization: { href: `/sites/${siteId}/fix`, label: '調整標題' },
    contact_info: { href: `/sites/${siteId}#brand-facts`, label: '補聯絡資訊' },
    image_alt: { href: `/sites/${siteId}/fix`, label: '查看圖片 Alt 建議' },
    robots_ai: { href: `/sites/${siteId}/fix`, label: '檢查 robots.txt' },
  }
  return actions[issue.indicator] ?? { href: `/sites/${siteId}/fix`, label: '查看處理方式' }
}

function ActionableIssueRow({ issue, siteId }: { issue: GuidedIssue; siteId: string }) {
  const action = issueAction(issue, siteId)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-white">{issue.label}</p>
          <Badge className={statusClass(issue.status)}>{issue.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{issue.nextStep}</p>
      </div>
      <Link href={action.href}>
        <Button size="sm" variant="outline" className="w-full md:w-auto">
          {action.label}
        </Button>
      </Link>
    </div>
  )
}

function buildFollowUpTasks({
  report,
  plan,
  siteId,
}: {
  report?: { remaining: GuidedIssue[]; verification: Array<{ key: string; label: string; passed: boolean }>; crawlerVisits: unknown[] } | null
  plan: { missingBrandFacts: string[] }
  siteId: string
}) {
  const tasks: Array<{
    key: string
    title: string
    description: string
    href: string
    cta: string
    icon: typeof BookOpen
    priority: 'high' | 'medium' | 'low'
  }> = []
  const addTask = (task: (typeof tasks)[number]) => {
    if (!tasks.some((existing) => existing.key === task.key)) tasks.push(task)
  }

  const remainingIndicators = new Set((report?.remaining ?? []).map((issue) => issue.indicator))
  const failedVerification = new Set((report?.verification ?? []).filter((item) => !item.passed).map((item) => item.key))

  if (plan.missingBrandFacts.length > 0 || remainingIndicators.has('contact_info') || remainingIndicators.has('meta_description')) {
    addTask({
      key: 'brand-facts',
      title: '補品牌事實資料',
      description: `還缺 ${Math.max(plan.missingBrandFacts.length, 1)} 項品牌資料，會影響 AI Wiki、llms-full 與內容生成。`,
      href: `/sites/${siteId}#brand-facts`,
      cta: '去補資料',
      icon: BookOpen,
      priority: 'high',
    })
  }

  if (remainingIndicators.has('faq_schema') || plan.missingBrandFacts.some((item) => item.includes('Q&A'))) {
    addTask({
      key: 'knowledge',
      title: '補品牌 Q&A',
      description: '問答數不足會讓 FAQ Schema 和 AI 可引用內容變弱，建議至少補 6 組。',
      href: `/sites/${siteId}/knowledge`,
      cta: '新增 Q&A',
      icon: BookOpen,
      priority: 'high',
    })
  }

  if (remainingIndicators.has('llms_txt') || failedVerification.has('llms_txt')) {
    addTask({
      key: 'llms',
      title: '更新 llms.txt',
      description: '/llms.txt 還沒被確認為可讀，請更新或重新發布 AI 可讀資料。',
      href: `/sites/${siteId}/llms-txt`,
      cta: '更新 llms.txt',
      icon: FileText,
      priority: 'high',
    })
  }

  if (remainingIndicators.has('json_ld') || remainingIndicators.has('og_tags') || remainingIndicators.has('meta_description')) {
    addTask({
      key: 'cms-fix',
      title: '再次派送 CMS 修復',
      description: '仍有結構化資料或頁面語意項目未通過，可重新產生修復包或檢查 WordPress 套用狀態。',
      href: `/sites/${siteId}/cms-fix`,
      cta: '回 CMS 修復',
      icon: PlugZap,
      priority: 'medium',
    })
  }

  if (remainingIndicators.has('title_optimization') || remainingIndicators.has('image_alt') || remainingIndicators.has('robots_ai')) {
    addTask({
      key: 'manual-fix',
      title: '處理人工修復項目',
      description: '標題、圖片 Alt、robots.txt 這類項目通常需要人工調整內容或網站設定。',
      href: `/sites/${siteId}/fix`,
      cta: '看修復建議',
      icon: Wrench,
      priority: 'medium',
    })
  }

  if ((report?.crawlerVisits.length ?? 0) === 0) {
    addTask({
      key: 'crawler',
      title: '確認 AI 爬蟲追蹤',
      description: '目前還沒有真實 AI 爬蟲紀錄，建議確認追蹤碼與公開頁面是否可被存取。',
      href: `/sites/${siteId}/crawler`,
      cta: '查看追蹤',
      icon: SearchCheck,
      priority: 'low',
    })
  }

  return tasks
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
  const searchParams = useSearchParams()
  const rawSiteId = params.siteId as string
  const isPlaceholderSiteId = !rawSiteId || rawSiteId.includes('{') || rawSiteId.includes('}')
  const siteId = isPlaceholderSiteId ? '' : rawSiteId
  const { data: plan, isLoading: planLoading, error: planError } = useGuidedFixPlan(siteId)
  const { data: handoff, isLoading: handoffLoading } = useEngineerHandoff(siteId)
  const { data: report, isLoading: reportLoading } = useCompletionReport(siteId)
  const { data: cmsFixStatus } = useCmsFixStatus(siteId)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'report' ? 'report' : 'quick-wins')
  const latestCmsRun = cmsFixStatus?.latestRun
  const cmsRunStatus = latestCmsRun?.status
  const latestScanAt = plan?.scan?.completedAt ? new Date(plan.scan.completedAt).getTime() : 0
  const latestCmsRunUpdatedAt = latestCmsRun?.updatedAt ? new Date(latestCmsRun.updatedAt).getTime() : 0
  const hasDispatchedCmsFix =
    cmsRunStatus === 'dispatched' ||
    cmsRunStatus === 'partially_applied' ||
    cmsRunStatus === 'applied'
  const hasPostFixScan = Boolean(hasDispatchedCmsFix && latestScanAt > latestCmsRunUpdatedAt)
  const needsPostFixScan = Boolean(hasDispatchedCmsFix && !hasPostFixScan)
  const flowSteps = [
    {
      key: 'scan',
      label: '掃描診斷',
      done: true,
      active: false,
    },
    {
      key: 'fix',
      label: '選擇修復',
      done: hasDispatchedCmsFix,
      active: !hasDispatchedCmsFix,
    },
    {
      key: 'wp',
      label: '套用到網站',
      done: cmsRunStatus === 'applied' || hasPostFixScan,
      active: cmsRunStatus === 'dispatched' || cmsRunStatus === 'partially_applied',
    },
    {
      key: 'verify',
      label: '重新掃描驗證',
      done: hasPostFixScan,
      active: needsPostFixScan,
    },
    {
      key: 'next',
      label: '後續補強',
      done: false,
      active: hasPostFixScan,
    },
  ]

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'report') {
      setActiveTab('report')
      window.setTimeout(() => {
        document.getElementById('completion-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    if (window.location.hash === '#handoff') {
      setActiveTab('handoff')
      window.setTimeout(() => {
        document.getElementById('handoff')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [searchParams])

  useEffect(() => {
    if (hasPostFixScan) {
      setActiveTab('report')
    }
  }, [hasPostFixScan])

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

  const followUpTasks = buildFollowUpTasks({ report, plan, siteId })
  const highPriorityTasks = followUpTasks.filter((task) => task.priority === 'high')
  const estimatedGain = Math.max(0, plan.headline.estimatedScore - plan.headline.currentScore)
  const headlineTitle =
    plan.headline.quickWinCount > 0
      ? plan.headline.title
      : `${plan.site.name} 目前沒有可一鍵加分項目`

  return (
    <div className="space-y-6">
      <SiteWorkspaceTabs siteId={siteId} siteName={plan.site.name} />
      <div>
        <PageHeader
          title="最快 GEO 提升方案"
          description="不需要先理解技術名詞。這裡只列出最短路徑：能一鍵處理的先做，不能自動處理的再交給工程師或代裝。"
          icon={Sparkles}
          actions={
            <a href={plan.site.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                開啟網站
              </Button>
            </a>
          }
        />
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white">目前流程位置</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {needsPostFixScan
                  ? '修復已送出，請先重新掃描驗證；完成後才會更新後續建議。'
                  : hasPostFixScan
                  ? '已完成修復後重新掃描，請查看完成報告與下一步。'
                  : `依照順序完成掃描、修復、驗證。此頁會把可自動修復 ${plan.headline.quickWinCount} 項、需人工處理 ${plan.headline.manualCount} 項分開列出。`}
              </p>
            </div>
            {needsPostFixScan ? (
              <Link href={`/sites/${siteId}?afterCmsFix=1&autoScan=1`}>
                <Button className="w-full bg-green-600 text-white hover:bg-green-700 md:w-auto">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  立即重新掃描驗證
                </Button>
              </Link>
            ) : hasPostFixScan ? (
              <Button className="w-full md:w-auto" onClick={() => setActiveTab('report')}>
                <SearchCheck className="mr-2 h-4 w-4" />
                查看完成報告
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            {flowSteps.map((step, index) => (
              <div
                key={step.key}
                className={`rounded-md border p-3 text-sm ${
                  step.active
                    ? 'border-blue-400 bg-blue-500/15 text-white'
                    : step.done
                    ? 'border-green-500/30 bg-green-500/10 text-green-100'
                    : 'border-white/10 bg-black/15 text-muted-foreground'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs">Step {index + 1}</span>
                  {step.done ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : null}
                </div>
                <p className="font-medium">{step.label}</p>
              </div>
            ))}
          </div>
          {hasPostFixScan ? (
            <div className="mt-5 rounded-md border border-blue-500/20 bg-blue-500/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-white">後續補強任務</p>
                  <p className="mt-1 text-sm text-blue-100/80">
                    {followUpTasks.length > 0
                      ? `目前有 ${followUpTasks.length} 個可執行補強項目，先處理高優先項目。`
                      : '目前沒有明顯補強項目，可以持續追蹤 AI 爬蟲與後續掃描。'}
                  </p>
                </div>
                <Button variant="outline" className="w-full md:w-auto" onClick={() => setActiveTab('report')}>
                  查看報告明細
                </Button>
              </div>
              {followUpTasks.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {(highPriorityTasks.length > 0 ? highPriorityTasks : followUpTasks).slice(0, 3).map((task) => {
                    const Icon = task.icon
                    return (
                      <Link key={task.key} href={task.href} className="rounded-md border border-white/10 bg-black/20 p-4 hover:bg-white/10">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/15 text-blue-200">
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="font-medium text-white">{task.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                        <p className="mt-3 text-sm font-medium text-blue-200">{task.cta}</p>
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-blue-500/30">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <Badge className="mb-3 bg-blue-500/20 text-blue-200">建議第一步</Badge>
            <h2 className="text-2xl font-bold text-white">{headlineTitle}</h2>
            <p className="mt-2 text-sm text-blue-100">
              {plan.headline.quickWinCount > 0
                ? `預估 ${plan.headline.estimatedMinutes} 分鐘完成 ${plan.headline.quickWinCount} 個可修復項目，可提升約 ${estimatedGain} 分。`
                : '目前沒有會直接加分的自動修復項目；請先處理人工項目或重新掃描確認最新狀態。'}
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

      {needsPostFixScan ? (
        <Card className="border-green-500/30">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge className="mb-2 bg-green-500/20 text-green-200">已進入驗證階段</Badge>
              <h2 className="text-lg font-semibold text-white">下一步：修復後重新掃描</h2>
              <p className="mt-1 max-w-2xl text-sm text-green-100/80">
                CMS 修復包已派送到 WordPress。請重新掃描網站，讓系統用最新 HTML 判斷修復是否真的生效，再更新後續引導。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href={`/sites/${siteId}?afterCmsFix=1&autoScan=1`}>
                <Button className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
                  <SearchCheck className="mr-2 h-4 w-4" />
                  立即重新掃描驗證
                </Button>
              </Link>
              <Link href={`/sites/${siteId}/cms-fix`}>
                <Button variant="outline" className="w-full sm:w-auto">
                  查看派送狀態
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : hasPostFixScan ? (
        <Card className="border-blue-500/30">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge className="mb-2 bg-blue-500/20 text-blue-200">已完成驗證掃描</Badge>
              <h2 className="text-lg font-semibold text-white">現在看完成報告</h2>
              <p className="mt-1 max-w-2xl text-sm text-blue-100/80">
                最新掃描已在修復包之後完成。請查看分數變化、已解決項目與剩餘下一步。
              </p>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => setActiveTab('report')}>
              <SearchCheck className="mr-2 h-4 w-4" />
              查看完成報告
            </Button>
          </CardContent>
        </Card>
      ) : (
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
      )}

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

        <TabsContent value="report" id="completion-report" className="space-y-4">
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
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-white">接下來要做什麼</p>
                        <p className="mt-1 text-sm text-blue-100/80">
                          下面每張卡片都可以直接跳去執行，不需要回頭找功能入口。
                        </p>
                      </div>
                      {followUpTasks.length > 0 ? (
                        <Badge className="bg-blue-500/20 text-blue-200">{followUpTasks.length} 個任務</Badge>
                      ) : null}
                    </div>
                    {followUpTasks.length > 0 ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {followUpTasks.map((task) => {
                          const Icon = task.icon
                          return (
                            <div key={task.key} className="rounded-md border border-white/10 bg-black/20 p-4">
                              <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-200">
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-white">{task.title}</p>
                                    {task.priority === 'high' ? <Badge className="bg-red-500/20 text-red-200">優先</Badge> : null}
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                                </div>
                              </div>
                              <Link href={task.href}>
                                <Button size="sm" className="mt-4 w-full md:w-auto">
                                  {task.cta}
                                </Button>
                              </Link>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
                        目前沒有主要補強任務。可以查看 AI 爬蟲追蹤，觀察是否開始被 AI 工具讀取。
                      </div>
                    )}
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
                      <p className="font-medium">仍需處理的掃描項目</p>
                      {report.remaining.slice(0, 3).map((issue) => (
                        <ActionableIssueRow key={issue.indicator} issue={issue} siteId={siteId} />
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
