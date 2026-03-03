'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ExternalLink, RefreshCw, Loader2, Trash2, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSites, useCreateSite, useDeleteSite } from '@/hooks/use-sites'
import { useTriggerScan } from '@/hooks/use-scan'

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const color =
    score >= 80 ? '#22c55e' : score >= 60 ? '#3b82f6' : score >= 40 ? '#eab308' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-lg font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  )
}

function SiteCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="flex items-center justify-center py-4">
        <Skeleton className="h-[80px] w-[80px] rounded-full" />
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2 w-full">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardFooter>
    </Card>
  )
}

export default function SitesPage() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSiteUrl, setNewSiteUrl] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: sites, isLoading, error } = useSites()
  const createSiteMutation = useCreateSite()
  const deleteSiteMutation = useDeleteSite()
  const triggerScanMutation = useTriggerScan()

  if (error) {
    toast.error('無法載入網站資料', { id: 'sites-error' })
  }

  const handleAddSite = async () => {
    if (!newSiteUrl.trim()) {
      toast.error('請輸入網址')
      return
    }

    try {
      await createSiteMutation.mutateAsync({
        url: newSiteUrl.trim(),
        name: newSiteName.trim() || newSiteUrl.trim(),
      })
      toast.success('網站新增成功')
      setNewSiteUrl('')
      setNewSiteName('')
      setShowAddForm(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '新增失敗，請稍後再試')
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteSiteMutation.mutateAsync(id)
      toast.success('網站已刪除')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '刪除失敗，請稍後再試')
    } finally {
      setDeletingId(null)
    }
  }

  const handleScan = async (siteId: string) => {
    setScanningId(siteId)
    try {
      await triggerScanMutation.mutateAsync(siteId)
      toast.success('掃描已啟動')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '掃描失敗，請稍後再試')
    } finally {
      setScanningId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">我的網站</h1>
          <p className="text-muted-foreground mt-1">管理和監控您的網站 GEO 分數</p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-4 w-4 mr-2" />
          新增網站
        </Button>
      </div>

      {/* Add site form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              <Input
                placeholder="網站名稱（選填）"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
              />
              <div className="flex gap-3">
                <Input
                  placeholder="輸入網址，例如 https://example.com"
                  value={newSiteUrl}
                  onChange={(e) => setNewSiteUrl(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSite()}
                />
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleAddSite}
                  disabled={createSiteMutation.isPending}
                >
                  {createSiteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    '新增'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewSiteUrl('')
                    setNewSiteName('')
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sites grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <SiteCardSkeleton key={i} />
          ))}
        </div>
      ) : !sites || sites.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                尚無網站
              </h3>
              <p className="text-muted-foreground mb-4">
                點擊「新增網站」開始管理您的網站
              </p>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                新增第一個網站
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site: any) => (
            <Card key={site.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{site.name}</CardTitle>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{site.url}</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    onClick={() => handleDelete(site.id)}
                    disabled={deletingId === site.id}
                  >
                    {deletingId === site.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-center py-4">
                <ScoreGauge score={site.overallScore ?? site.score ?? 0} size={80} />
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground w-full">
                  上次掃描: {site.updatedAt ? new Date(site.updatedAt).toLocaleString('zh-TW') : '尚未掃描'}
                </p>
                <div className="flex gap-2 w-full">
                  <Link href={`/sites/${site.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      查看詳情
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleScan(site.id)}
                    disabled={scanningId === site.id}
                  >
                    {scanningId === site.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    掃描
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
