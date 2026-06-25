'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Radio,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { SiteWorkspaceTabs } from '@/components/layout/site-workspace-tabs'
import { cn } from '@/lib/utils'
import { useSite } from '@/hooks/use-sites'
import {
  useMonitorDashboard,
  useCreateMonitor,
  useCheckCitation,
  useDeleteMonitor,
} from '@/hooks/use-monitor'

const platformMeta: Record<string, { color: string; bgColor: string; textColor: string; icon: string }> = {
  ChatGPT: { color: 'bg-green-500', bgColor: 'bg-green-500/20', textColor: 'text-green-300', icon: '🤖' },
  Claude: { color: 'bg-orange-500', bgColor: 'bg-orange-500/20', textColor: 'text-orange-300', icon: '🧠' },
  Perplexity: { color: 'bg-blue-500', bgColor: 'bg-blue-500/20', textColor: 'text-blue-300', icon: '🔍' },
  Gemini: { color: 'bg-purple-500', bgColor: 'bg-purple-500/20', textColor: 'text-purple-300', icon: '✨' },
  Copilot: { color: 'bg-cyan-500', bgColor: 'bg-cyan-500/20', textColor: 'text-cyan-300', icon: '🪟' },
}
const defaultPlatformMeta = { color: 'bg-gray-500', bgColor: 'bg-white/5', textColor: 'text-gray-300', icon: '🔗' }

const PLATFORM_OPTIONS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'copilot', label: 'Copilot' },
]

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  return `${diffDays} 天前`
}

export default function SiteMonitorPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { data: site } = useSite(siteId)
  const { data: monitorData, isLoading, error } = useMonitorDashboard()
  const createMonitor = useCreateMonitor()
  const checkCitation = useCheckCitation()
  const deleteMonitor = useDeleteMonitor()

  const [showForm, setShowForm] = useState(false)
  const [platform, setPlatform] = useState('')
  const [queryText, setQueryText] = useState('')
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (error) {
    toast.error('無法載入監控資料', { id: 'monitor-error' })
  }

  // Only this site's queries
  const queries = useMemo(
    () => (monitorData?.queries ?? []).filter((q) => q.siteId === siteId),
    [monitorData, siteId],
  )

  // Per-site platform stats (computed from this site's queries only)
  const platformStats = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; checked: number; mentioned: number; errorCount: number }
    >()
    queries.forEach((q) => {
      const name = q.platform
      const e = map.get(name) ?? { name, total: 0, checked: 0, mentioned: 0, errorCount: 0 }
      e.total += 1
      if (q.status === 'checked') e.checked += 1
      if (q.cited) e.mentioned += 1
      if (q.status === 'error') e.errorCount += 1
      map.set(name, e)
    })
    return Array.from(map.values())
      .map((p) => ({ ...p, rate: p.checked > 0 ? Math.round((p.mentioned / p.checked) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [queries])

  const handleCreate = async () => {
    if (!queryText.trim()) {
      toast.error('請輸入要追蹤的問題')
      return
    }
    if (!platform) {
      toast.error('請選擇一個平台')
      return
    }
    try {
      await createMonitor.mutateAsync({ siteId, platform, query: queryText.trim() })
      toast.success('監控查詢新增成功！')
      setShowForm(false)
      setQueryText('')
      setPlatform('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '新增監控查詢失敗')
    }
  }

  const handleCheck = async (id: string) => {
    setCheckingId(id)
    try {
      await checkCitation.mutateAsync(id)
      toast.success('檢測完成')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '檢測失敗')
    } finally {
      setCheckingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這個監控查詢嗎？')) return
    setDeletingId(id)
    try {
      await deleteMonitor.mutateAsync(id)
      toast.success('已刪除')
    } catch {
      toast.error('刪除失敗')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <SiteWorkspaceTabs siteId={siteId} siteName={site?.name} />

      <PageHeader
        title="監控"
        description={`追蹤 ${site?.name ?? '這個網站'}在各大 AI 平台的引用狀況`}
        actions={
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setShowForm((prev) => !prev)}
          >
            {showForm ? (
              <>
                <X className="mr-2 h-4 w-4" />
                取消
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                新增查詢
              </>
            )}
          </Button>
        }
      />

      {/* Add query form (site is fixed to current site) */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">新增監控查詢</CardTitle>
            <CardDescription>
              輸入使用者可能會問 AI 的問題，系統會檢查各平台回答中是否提到「{site?.name ?? '這個網站'}」。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
              <div className="space-y-2">
                <Label>查詢內容</Label>
                <Input
                  placeholder="例如：台北有推薦的整復推拿嗎？"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="space-y-2">
                <Label>平台</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCreate}
                disabled={createMonitor.isPending}
              >
                {createMonitor.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    新增中...
                  </>
                ) : (
                  '新增查詢'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-site platform cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="mb-4 h-8 w-8 rounded" />
                <Skeleton className="mb-2 h-5 w-20" />
                <Skeleton className="mb-1 h-8 w-16" />
                <Skeleton className="mt-3 h-2 w-full rounded-full" />
              </CardContent>
            </Card>
          ))
        ) : platformStats.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12">
              <div className="text-center">
                <Radio className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-1 text-lg font-semibold text-white">尚無平台資料</h3>
                <p className="text-muted-foreground">為這個網站新增查詢後，將自動追蹤各平台引用狀態</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          platformStats.map((p) => {
            const meta = platformMeta[p.name] || defaultPlatformMeta
            return (
              <Card key={p.name} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-2xl">{meta.icon}</span>
                    {p.errorCount > 0 && (
                      <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-600">
                        {p.errorCount} 錯誤
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-white">{p.name}</h3>
                  <div className="mt-1 flex items-end gap-1">
                    <span className="text-3xl font-bold">{p.rate}%</span>
                    <span className="mb-1 text-sm text-muted-foreground">引用率</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn('h-full rounded-full transition-all', meta.color)}
                      style={{ width: `${p.rate}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>已引用 {p.mentioned}/{p.checked}</span>
                    <span>共 {p.total} 筆查詢</span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Query list */}
      <Card>
        <CardHeader>
          <CardTitle>監控查詢列表</CardTitle>
          <CardDescription>點擊查詢可展開查看 AI 完整回應內容</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : queries.length === 0 ? (
            <div className="py-8 text-center">
              <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">尚無監控查詢</p>
              <p className="mt-1 text-sm text-muted-foreground">點擊「新增查詢」開始追蹤這個網站的 AI 引用狀態</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {queries.map((q) => {
                const isExpanded = expandedId === q.id
                const meta = platformMeta[q.platform] || defaultPlatformMeta
                return (
                  <div key={q.id}>
                    <div
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-1 py-3 transition-colors',
                        isExpanded ? 'bg-blue-500/10' : 'hover:bg-white/5',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{q.query}</p>
                      </div>

                      <Badge className={cn('flex-shrink-0 text-[10px]', meta.bgColor, meta.textColor)}>
                        {q.platform}
                      </Badge>

                      {q.cited && q.position != null && (
                        <span
                          className="flex flex-shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
                          title="引用位置（1=最前，10=最後）"
                        >
                          <MapPin className="h-3 w-3" />
                          {q.position}/10
                        </span>
                      )}

                      <div className="w-20 flex-shrink-0">
                        {q.status === 'error' ? (
                          <span className="flex items-center gap-1 text-xs text-amber-600" title={q.errorMessage}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            失敗
                          </span>
                        ) : q.status === 'pending' ? (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3.5 w-3.5" />
                            待檢測
                          </span>
                        ) : q.cited ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            已引用
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-500">
                            <XCircle className="h-3.5 w-3.5" />
                            未引用
                          </span>
                        )}
                      </div>

                      <span className="w-20 flex-shrink-0 text-right text-xs text-muted-foreground">
                        {q.lastCheck
                          ? typeof q.lastCheck === 'string' && q.lastCheck.includes('前')
                            ? q.lastCheck
                            : formatTimeAgo(q.lastCheck)
                          : '--'}
                      </span>

                      <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleCheck(q.id)}
                          disabled={checkingId === q.id}
                        >
                          {checkingId === q.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:bg-red-500/20 hover:text-red-700"
                          onClick={() => handleDelete(q.id)}
                          disabled={deletingId === q.id}
                        >
                          {deletingId === q.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-dashed border-white/10 bg-white/5 px-4 pb-4 pt-3">
                        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span>平台：{q.platform}</span>
                          {q.position != null && (
                            <span>
                              引用位置：{q.position}/10
                              {q.position <= 3 ? '（靠前）' : q.position >= 8 ? '（靠後）' : '（中段）'}
                            </span>
                          )}
                          <span>
                            狀態：
                            {q.status === 'checked'
                              ? q.cited
                                ? '已引用'
                                : '未引用'
                              : q.status === 'error'
                                ? '檢測失敗'
                                : '待檢測'}
                          </span>
                        </div>

                        {q.status === 'error' && q.errorMessage && (
                          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/20 p-3">
                            <p className="flex items-center gap-1 text-xs text-amber-300">
                              <AlertTriangle className="h-3 w-3" />
                              錯誤訊息：{q.errorMessage}
                            </p>
                          </div>
                        )}

                        {q.response ? (
                          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">AI 回應內容：</p>
                            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                              {q.response}
                            </div>
                          </div>
                        ) : q.status === 'pending' ? (
                          <p className="text-sm text-muted-foreground">尚未執行檢測，點擊右側重新整理按鈕開始檢測</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
