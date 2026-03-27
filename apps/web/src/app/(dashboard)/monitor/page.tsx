'use client'

import { useState } from 'react'
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Radio,
  X,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MapPin,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useMonitorDashboard, useCreateMonitor, useCheckCitation, useDeleteMonitor } from '@/hooks/use-monitor'
import { useSites } from '@/hooks/use-sites'

const platformMeta: Record<string, { color: string; bgColor: string; textColor: string; icon: string }> = {
  ChatGPT: { color: 'bg-green-500', bgColor: 'bg-green-50', textColor: 'text-green-700', icon: '🤖' },
  Claude: { color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', icon: '🧠' },
  Perplexity: { color: 'bg-blue-500', bgColor: 'bg-blue-50', textColor: 'text-blue-700', icon: '🔍' },
  Gemini: { color: 'bg-purple-500', bgColor: 'bg-purple-50', textColor: 'text-purple-700', icon: '✨' },
  Copilot: { color: 'bg-cyan-500', bgColor: 'bg-cyan-50', textColor: 'text-cyan-700', icon: '🪟' },
}
const defaultPlatformMeta = { color: 'bg-gray-500', bgColor: 'bg-gray-50', textColor: 'text-gray-700', icon: '🔗' }

function PlatformCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-8 w-8 rounded mb-4" />
        <Skeleton className="h-5 w-20 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-2 w-full rounded-full mt-3" />
      </CardContent>
    </Card>
  )
}

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

const PLATFORM_OPTIONS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'copilot', label: 'Copilot' },
]

export default function MonitorPage() {
  const { data: monitorData, isLoading, error } = useMonitorDashboard()
  const { data: sites } = useSites()
  const createMonitor = useCreateMonitor()
  const checkCitation = useCheckCitation()
  const deleteMonitor = useDeleteMonitor()

  const [showForm, setShowForm] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [queryText, setQueryText] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState('')

  if (error) {
    toast.error('無法載入監控資料', { id: 'monitor-error' })
  }

  const platforms = monitorData?.platforms ?? []
  const queries = monitorData?.queries ?? []

  const handleCreateMonitor = async () => {
    if (!selectedSiteId) { toast.error('請選擇一個網站'); return }
    if (!queryText.trim()) { toast.error('請輸入查詢內容'); return }
    if (!selectedPlatform) { toast.error('請選擇一個平台'); return }
    try {
      await createMonitor.mutateAsync({
        siteId: selectedSiteId,
        query: queryText.trim(),
        platform: selectedPlatform,
      })
      toast.success('監控查詢新增成功！')
      setShowForm(false)
      setSelectedSiteId('')
      setQueryText('')
      setSelectedPlatform('')
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
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI 引用監控</h1>
          <p className="text-muted-foreground mt-1">
            追蹤您的品牌在各大 AI 平台的引用狀況
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setShowForm((prev) => !prev)}
        >
          {showForm ? (
            <><X className="h-4 w-4 mr-2" />取消</>
          ) : (
            <><Plus className="h-4 w-4 mr-2" />新增查詢</>
          )}
        </Button>
      </div>

      {/* Add query form */}
      {showForm && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-lg">新增監控查詢</CardTitle>
            <CardDescription>選擇網站和平台，輸入要追蹤的查詢內容</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>網站</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger><SelectValue placeholder="選擇網站" /></SelectTrigger>
                  <SelectContent>
                    {(sites ?? []).map((site: any) => (
                      <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>查詢內容</Label>
                <Input placeholder="例如：最好的 SEO 工具" value={queryText} onChange={(e) => setQueryText(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>平台</Label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger><SelectValue placeholder="選擇平台" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateMonitor} disabled={createMonitor.isPending}>
                {createMonitor.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />新增中...</> : '新增查詢'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <PlatformCardSkeleton key={i} />)
        ) : platforms.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12">
              <div className="text-center">
                <Radio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">尚無平台資料</h3>
                <p className="text-muted-foreground">新增查詢後將自動追蹤各平台引用狀態</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          platforms.map((platform: any) => {
            const meta = platformMeta[platform.name] || defaultPlatformMeta
            return (
              <Card key={platform.name}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{meta.icon}</span>
                    {platform.errorCount > 0 && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                        {platform.errorCount} 錯誤
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                  <div className="flex items-end gap-1 mt-1">
                    <span className="text-3xl font-bold">{platform.rate}%</span>
                    <span className="text-sm text-muted-foreground mb-1">引用率</span>
                  </div>
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', meta.color)}
                      style={{ width: `${platform.rate}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>已引用 {platform.mentioned}/{platform.checked}</span>
                    <span>共 {platform.total} 筆查詢</span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Monitoring queries */}
      <Card>
        <CardHeader>
          <CardTitle>監控查詢列表</CardTitle>
          <CardDescription>點擊查詢可展開查看 AI 完整回應內容</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : queries.length === 0 ? (
            <div className="text-center py-8">
              <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">尚無監控查詢</p>
              <p className="text-sm text-muted-foreground mt-1">點擊「新增查詢」開始追蹤 AI 引用狀態</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden divide-y">
              {queries.map((q: any) => {
                const isExpanded = expandedId === q.id
                const meta = platformMeta[q.platform] || defaultPlatformMeta
                return (
                  <div key={q.id}>
                    {/* Row */}
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                        isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{q.query}</p>
                      </div>

                      <Badge className={cn('text-[10px] flex-shrink-0', meta.bgColor, meta.textColor)}>
                        {q.platform}
                      </Badge>

                      {/* Position */}
                      {q.cited && q.position != null && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0" title="引用位置（1=最前，10=最後）">
                          <MapPin className="h-3 w-3" />
                          {q.position}/10
                        </span>
                      )}

                      {/* Status */}
                      <div className="flex-shrink-0 w-20">
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

                      {/* Time */}
                      <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right">
                        {q.lastCheck
                          ? (typeof q.lastCheck === 'string' && q.lastCheck.includes('前'))
                            ? q.lastCheck
                            : formatTimeAgo(q.lastCheck)
                          : '--'}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCheck(q.id)} disabled={checkingId === q.id}>
                          {checkingId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(q.id)} disabled={deletingId === q.id}>
                          {deletingId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-gray-50/70 border-t border-dashed">
                        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                          <span>平台：{q.platform}</span>
                          {q.position != null && <span>引用位置：{q.position}/10{q.position <= 3 ? '（靠前）' : q.position >= 8 ? '（靠後）' : '（中段）'}</span>}
                          <span>狀態：{q.status === 'checked' ? (q.cited ? '已引用' : '未引用') : q.status === 'error' ? '檢測失敗' : '待檢測'}</span>
                        </div>

                        {q.status === 'error' && q.errorMessage && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                            <p className="text-xs text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              錯誤訊息：{q.errorMessage}
                            </p>
                          </div>
                        )}

                        {q.response ? (
                          <div className="bg-white border rounded-lg p-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">AI 回應內容：</p>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
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
