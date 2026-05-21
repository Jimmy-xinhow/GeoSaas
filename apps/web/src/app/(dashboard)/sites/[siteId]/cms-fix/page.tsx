'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  RotateCw,
  Settings,
  ShieldCheck,
  Upload,
  Wrench,
  XCircle,
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
import { useSite } from '@/hooks/use-sites'
import {
  useCmsFixStatus,
  useConnectWordPress,
  useCreateCmsFixPlan,
  useDispatchCmsFixRun,
  type ConnectWordPressResponse,
  type SiteFixAction,
} from '@/hooks/use-cms-fix'

const pluginDownloadUrl = '/downloads/geovault-auto-fix-0.1.2.zip'

const installSteps = [
  {
    title: '下載外掛 ZIP',
    description: '先下載 geovault-auto-fix.zip，不需要解壓縮。',
    icon: Download,
  },
  {
    title: '上傳到 WordPress',
    description: '到 WordPress 後台：外掛 > 新增外掛 > 上傳外掛。',
    icon: Upload,
  },
  {
    title: '啟用外掛',
    description: '安裝完成後按啟用，左側設定會出現 Geovault Auto Fix。',
    icon: CheckCircle2,
  },
  {
    title: '貼上綁定設定',
    description: '回到本頁產生 Token，把三個欄位貼進 WordPress 設定頁。',
    icon: KeyRound,
  },
]

const actionLabels: Record<string, string> = {
  install_json_ld: 'JSON-LD',
  install_og_tags: 'Open Graph',
  install_faq_schema: 'FAQ Schema',
  install_meta_description: 'Meta Description',
  install_llms_txt: 'llms.txt',
  install_geo_badge: 'GEO Badge',
  install_crawler_tracking: 'AI 爬蟲追蹤',
}

const statusLabels: Record<string, string> = {
  pending: '尚未連線',
  connected: '已連線',
  planned: '已產生修復包',
  dispatched: '已派送到 WordPress',
  partially_applied: '部分完成',
  applied: '已完成',
  failed: '失敗',
  skipped: '略過',
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-300',
    connected: 'bg-green-500/20 text-green-300',
    planned: 'bg-blue-500/20 text-blue-300',
    dispatched: 'bg-cyan-500/20 text-cyan-300',
    partially_applied: 'bg-yellow-500/20 text-yellow-300',
    applied: 'bg-green-500/20 text-green-300',
    failed: 'bg-red-500/20 text-red-300',
    skipped: 'bg-gray-500/20 text-gray-300',
  }
  return (
    <Badge className={styles[status] || 'bg-white/10 text-gray-300'}>
      {statusLabels[status] || status}
    </Badge>
  )
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

function getErrorMessage(err: any) {
  const message = err?.response?.data?.message || err?.message || ''
  if (message.includes('completed scan')) {
    return '請先完成一次網站掃描，再產生 CMS 修復包。'
  }
  if (message.includes('No CMS-fixable issues')) {
    return '最新掃描沒有需要 CMS 自動修復的項目。'
  }
  if (message.includes('Connect the WordPress plugin')) {
    return '請先完成 WordPress 外掛綁定，再派送修復包。'
  }
  if (message.includes('WordPress plugin has not connected')) {
    return '請先到 WordPress 的 Geovault Auto Fix 設定頁儲存設定並同步一次，確認外掛已連線後再派送。'
  }
  return message || '操作失敗，請稍後再試'
}

function normalizeExternalUrl(url: string | null | undefined) {
  const trimmed = String(url || '').trim()
  if (!trimmed) return '#'
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function ActionRow({ action }: { action: SiteFixAction }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-white">{action.title}</p>
          <Badge variant="outline">{actionLabels[action.type] || action.type}</Badge>
        </div>
        {action.error ? (
          <p className="mt-1 text-sm text-red-300">{action.error}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {action.status === 'applied'
              ? 'WordPress 外掛已回報完成。'
              : action.status === 'dispatched'
              ? '已派送，等待 WordPress 外掛執行。'
              : '已列入修復包，確認後可派送到 WordPress。'}
          </p>
        )}
      </div>
      <StatusBadge status={action.status} />
    </div>
  )
}

export default function CmsFixPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const [installConfig, setInstallConfig] = useState<ConnectWordPressResponse['install'] | null>(null)

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: status, isLoading: statusLoading, error: statusError } = useCmsFixStatus(siteId)
  const connect = useConnectWordPress(siteId)
  const createPlan = useCreateCmsFixPlan(siteId)
  const dispatchRun = useDispatchCmsFixRun(siteId)

  const latestRun = status?.latestRun
  const connection = status?.connection
  const siteUrl = normalizeExternalUrl(site?.url)

  const setupSnippet = useMemo(() => {
    if (!installConfig) return ''
    return [
      `API URL: ${installConfig.apiUrl}`,
      `Site ID: ${installConfig.siteId}`,
      `Plugin Token: ${installConfig.token}`,
    ].join('\n')
  }, [installConfig])

  const isLoading = siteLoading || statusLoading

  const handleConnect = async () => {
    try {
      const result = await connect.mutateAsync({})
      setInstallConfig(result.install)
      toast.success('已產生 WordPress 外掛綁定設定')
    } catch (err: any) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleCreatePlan = async () => {
    try {
      await createPlan.mutateAsync()
      toast.success('已從最新掃描產生 CMS 修復包')
    } catch (err: any) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleDispatch = async () => {
    if (!latestRun) return
    try {
      await dispatchRun.mutateAsync(latestRun.id)
      toast.success('已派送到 WordPress，外掛會自動拉取並套用')
    } catch (err: any) {
      toast.error(getErrorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!site) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="font-medium">找不到網站或沒有權限</p>
          <Link href="/sites">
            <Button className="mt-4" variant="outline">返回網站列表</Button>
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
              <PlugZap className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-white">CMS 一鍵結構修復</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              先安裝 WordPress 外掛，再由 Geovault 產生修復包並派送。外掛會處理 JSON-LD、FAQ Schema、OG/Meta、llms.txt、GEO Badge 與 AI 爬蟲追蹤。
            </p>
          </div>
          <a href={siteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              開啟網站
            </Button>
          </a>
        </div>
      </div>

      {statusError ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-100">
            CMS 狀態讀取失敗。請重新整理頁面；如果仍失敗，表示後端或資料庫 migration 尚未完成。
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-green-400" />
              外掛狀態
            </CardTitle>
            <CardDescription>WordPress 是否已和 Geovault 連線</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {connection ? (
              <>
                <StatusBadge status={connection.status} />
                <p className="text-sm text-muted-foreground">Token 末四碼：{connection.tokenLast4}</p>
                <p className="text-sm text-muted-foreground">
                  最後連線：{connection.lastSeenAt ? new Date(connection.lastSeenAt).toLocaleString('zh-TW') : '尚未連線'}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">尚未產生 WordPress 外掛設定。</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-5 w-5 text-blue-400" />
              修復包
            </CardTitle>
            <CardDescription>根據最新掃描建立可套用項目</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestRun ? (
              <>
                <StatusBadge status={latestRun.status} />
                <p className="text-sm text-muted-foreground">{latestRun.actions.length} 個修復項目</p>
                <p className="text-sm text-muted-foreground">
                  建立時間：{new Date(latestRun.createdAt).toLocaleString('zh-TW')}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">尚未產生修復包。</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-cyan-400" />
              建議順序
            </CardTitle>
            <CardDescription>照這三步走就能完成綁定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. 下載並啟用 WordPress 外掛</p>
            <p>2. 產生綁定設定，貼到 WordPress</p>
            <p>3. 產生修復包並派送到 WordPress</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. 安裝 WordPress 外掛</CardTitle>
          <CardDescription>
            不需要碰程式碼。下載 ZIP 後，從 WordPress 後台上傳並啟用外掛；如果之前出現兩個同名外掛，請先到主機檔案管理刪除下方兩個舊路徑。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={pluginDownloadUrl} download>
              <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                下載 WordPress 外掛
              </Button>
            </a>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-50 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">第一次安裝不知道怎麼做？</p>
              <p className="mt-1 text-blue-100/75">查看完整 WordPress 截圖教學，照畫面一步一步完成外掛安裝與綁定。</p>
            </div>
            <Link href={`/sites/${siteId}/cms-fix/guide`}>
              <Button variant="outline" className="w-full sm:w-auto">
                查看圖解教學
              </Button>
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {installSteps.map((step, index) => {
              const Icon = step.icon
              return (
              <div key={step.title} className="relative rounded-md border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-200">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mb-1 text-xs font-semibold text-blue-200">Step {index + 1}</p>
                <p className="font-medium text-white">{step.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
              )
            })}
          </div>
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            <p className="font-medium">如果 WordPress 後台出現兩個 Geovault Auto Fix：</p>
            <p className="mt-2">請到主機檔案管理或 FTP 的 <code>wp-content/plugins</code>，刪除：</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-black/25 p-3 text-xs text-yellow-50">geovault-auto-fix.php{'\n'}geovault-auto-fix/</pre>
            <p className="mt-2">刪完再重新整理 WordPress 外掛頁，只確認列表裡沒有 Geovault Auto Fix 後，再上傳新版 ZIP。</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 產生 WordPress 綁定設定</CardTitle>
          <CardDescription>
            按下按鈕後，把 API URL、Site ID、Plugin Token 貼到 WordPress 的 Geovault Auto Fix 設定頁。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleConnect} disabled={connect.isPending}>
            {connect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            產生或重置綁定 Token
          </Button>

          {installConfig ? (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-blue-100">貼到 WordPress 設定頁的內容</p>
                  <p className="text-sm text-blue-100/70">Settings &gt; Geovault Auto Fix</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copyText(setupSnippet)}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  複製設定
                </Button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-sm text-blue-50">{setupSnippet}</pre>
            </div>
          ) : connection ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
              這個網站已產生過 Token，基於安全性完整 Token 只會顯示一次。若你還沒貼到 WordPress，請按「產生或重置綁定 Token」取得新的完整設定。
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 產生並派送修復包</CardTitle>
          <CardDescription>
            修復包會根據最新完成的掃描建立。第一次使用前請先確認這個網站已經完成掃描。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleCreatePlan} disabled={createPlan.isPending}>
              {createPlan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              從最新掃描產生修復包
            </Button>
            <Button
              variant="outline"
              onClick={handleDispatch}
              disabled={!latestRun || connection?.status !== 'connected' || dispatchRun.isPending}
            >
              {dispatchRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              派送到 WordPress
            </Button>
            <Link href={`/sites/${siteId}`}>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                回網站詳情掃描
              </Button>
            </Link>
          </div>

          {latestRun?.actions.length ? (
            <div className="space-y-3">
              {latestRun.actions.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
              尚未建立修復包。請先完成掃描，再按「從最新掃描產生修復包」。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
