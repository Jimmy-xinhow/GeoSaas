'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
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
import { useCreateSite } from '@/hooks/use-sites'
import { clearPendingGuestScan, loadPendingGuestScan, type PendingGuestScan } from '@/lib/pending-guest-scan'

function normalizeSiteUrlInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const newSiteSchema = z.object({
  url: z.string().transform(normalizeSiteUrlInput).pipe(z.string().url('請輸入有效的網址')),
  name: z.string().min(1, '請輸入網站名稱'),
})

type NewSiteForm = z.infer<typeof newSiteSchema>

export default function NewSitePage() {
  const router = useRouter()
  const createSite = useCreateSite()
  const [pendingGuestScan, setPendingGuestScan] = useState<PendingGuestScan | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NewSiteForm>({
    resolver: zodResolver(newSiteSchema),
  })

  useEffect(() => {
    const pending = loadPendingGuestScan()
    if (!pending) return
    setPendingGuestScan(pending)
    setValue('url', pending.url)
    try {
      setValue('name', new URL(pending.url).hostname)
    } catch {
      setValue('name', pending.url)
    }
  }, [setValue])

  const onSubmit = async (data: NewSiteForm) => {
    try {
      const shouldImportGuestScan = pendingGuestScan
        ? normalizeSiteUrlInput(pendingGuestScan.url) === data.url
        : false
      const guestScanId = shouldImportGuestScan ? pendingGuestScan?.id : undefined
      const site = await createSite.mutateAsync({
        ...data,
        ...(guestScanId ? { guestScanId } : {}),
      })
      if (shouldImportGuestScan) {
        clearPendingGuestScan()
        setPendingGuestScan(null)
      }
      toast.success('網站新增成功！')
      router.push(`/sites/${site.id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '新增網站失敗，請稍後再試')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">新增網站</h1>
        <p className="text-muted-foreground mt-1">
          新增網站並立即開始 GEO 掃描
        </p>
      </div>

      <Card className="max-w-xl bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            網站資訊
          </CardTitle>
          <CardDescription>
            輸入您想要掃描的網站 URL 和名稱
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingGuestScan ? (
            <div className="mb-4 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3 text-sm text-blue-100">
              已偵測到你剛完成的免費掃描。新增同一個網址時會直接帶入結果，不會再重複掃描。
            </div>
          ) : null}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">網站 URL</Label>
              <Input
                id="url"
                type="text"
                inputMode="url"
                placeholder="example.com"
                {...register('url')}
              />
              {errors.url && (
                <p className="text-sm text-red-500">{errors.url.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">網站名稱</Label>
              <Input
                id="name"
                type="text"
                placeholder="我的網站"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={createSite.isPending}
            >
              {createSite.isPending ? '新增中...' : '新增並掃描'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
