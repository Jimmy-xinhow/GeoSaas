'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { GeovaultLogoCompact } from '@/components/logo'
import { useRegister } from '@/hooks/use-auth'
import { clearStoredAffiliateRef, getStoredAffiliateRef } from '@/components/affiliate/affiliate-tracker'
import GoogleSignInButton from '@/components/auth/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { savePendingGuestScan } from '@/lib/pending-guest-scan'

const registerSchema = z
  .object({
    name: z.string().min(1, '請輸入您的姓名'),
    email: z.string().email('請輸入有效的電子郵件'),
    password: z.string().min(8, '密碼至少需要 8 個字元'),
    confirmPassword: z.string().min(8, '請再次輸入密碼'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '兩次密碼不一致',
    path: ['confirmPassword'],
  })

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const searchParams = useSearchParams()
  const registerMutation = useRegister()
  const [verificationNotice, setVerificationNotice] = useState<{
    email: string
    devVerificationUrl?: string
  } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  useEffect(() => {
    const guestScanId = searchParams?.get('guestScanId')
    const siteUrl = searchParams?.get('siteUrl')
    if (guestScanId && siteUrl) {
      savePendingGuestScan({ id: guestScanId, url: siteUrl })
    }
  }, [searchParams])

  const onSubmit = async (data: RegisterForm) => {
    const { confirmPassword, ...payload } = data
    const affiliateRef = getStoredAffiliateRef()
    const registerPayload = affiliateRef
      ? { ...payload, affiliateCode: affiliateRef.code, affiliateVisitorId: affiliateRef.visitorId }
      : payload
    registerMutation.mutate(registerPayload, {
      onSuccess: (result) => {
        toast.success('註冊成功，歡迎加入！')
        clearStoredAffiliateRef()
        setVerificationNotice({
          email: result.user.email,
          devVerificationUrl: result.devVerificationUrl,
        })
      },
      onError: (error: any) => {
        const message =
          error?.response?.data?.message || '註冊失敗，請稍後再試'
        toast.error(message)
      },
    })
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mb-2 flex justify-center"><GeovaultLogoCompact className="h-9 w-auto" /></div>
        <CardTitle className="text-2xl">建立帳號</CardTitle>
        <CardDescription>免費註冊，立即開始使用</CardDescription>
      </CardHeader>
      <CardContent>
        {verificationNotice ? (
          <div className="mb-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-semibold">請先完成 Email 驗證</p>
            <p className="mt-2 leading-6">
              我們已將驗證連結寄到 {verificationNotice.email}。完成驗證後才能登入使用。
            </p>
            {verificationNotice.devVerificationUrl ? (
              <a
                href={verificationNotice.devVerificationUrl}
                className="mt-3 inline-flex text-blue-200 underline"
              >
                本地測試用驗證連結
              </a>
            ) : null}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              type="text"
              placeholder="請輸入您的姓名"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">電子郵件</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              type="password"
              placeholder="至少 8 個字元"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">確認密碼</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="再次輸入密碼"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-500">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? '建立中...' : '建立帳號'}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-muted-foreground">或</span>
          </div>
        </div>

        <GoogleSignInButton text="signup_with" redirectTo="/dashboard" />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          已有帳號？{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            登入
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
