'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { GeovaultLogoCompact } from '@/components/logo'
import { useVerifyEmail } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifyEmailMutation = useVerifyEmail()
  const didVerify = useRef(false)
  const token = searchParams?.get('token') || ''

  useEffect(() => {
    if (!token || didVerify.current) return
    didVerify.current = true
    verifyEmailMutation.mutate(token, {
      onSuccess: () => {
        toast.success('Email verified.')
        router.replace('/dashboard')
      },
      onError: (error: any) => {
        toast.error(error?.response?.data?.message || 'Email verification failed.')
      },
    })
  }, [router, token, verifyEmailMutation])

  const isMissingToken = !token
  const isLoading = verifyEmailMutation.isPending
  const hasError = Boolean(verifyEmailMutation.error) || isMissingToken

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mb-2 flex justify-center">
          <GeovaultLogoCompact className="h-9 w-auto" />
        </div>
        <CardTitle className="text-2xl">Email 驗證</CardTitle>
        <CardDescription>完成驗證後即可登入使用 Geovault。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        {isLoading ? (
          <div className="space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-muted-foreground">正在驗證你的 Email...</p>
          </div>
        ) : hasError ? (
          <div className="space-y-4">
            <p className="text-sm text-red-500">
              驗證連結無效或已過期，請回登入頁重新寄送驗證信。
            </p>
            <Link href="/login">
              <Button className="w-full" type="button">回到登入頁</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-emerald-600">驗證完成，正在前往控制台。</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
