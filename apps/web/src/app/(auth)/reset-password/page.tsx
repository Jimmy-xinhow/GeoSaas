'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
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
import { GeovaultLogoCompact } from '@/components/logo'
import apiClient from '@/lib/api-client'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      toast.error('重設連結缺少 token，請重新申請。')
      return
    }
    if (password.length < 8) {
      toast.error('新密碼至少需要 8 個字元。')
      return
    }
    if (password !== confirmPassword) {
      toast.error('兩次輸入的密碼不一致。')
      return
    }

    setIsSubmitting(true)
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: password })
      toast.success('密碼已更新，請重新登入。')
      router.replace('/login')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || '重設連結無效或已過期。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mb-2 flex justify-center">
          <GeovaultLogoCompact className="h-9 w-auto" />
        </div>
        <CardTitle className="text-2xl">重設密碼</CardTitle>
        <CardDescription>請輸入新的 Geovault 登入密碼</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-gray-400">此重設連結不完整，請重新申請密碼重設。</p>
            <Link href="/forgot-password">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                重新申請
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密碼</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">確認新密碼</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
              <KeyRound className="h-4 w-4 mr-2" />
              {isSubmitting ? '更新中...' : '更新密碼'}
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-gray-400 hover:text-white">
                <ArrowLeft className="h-3 w-3 inline mr-1" />
                返回登入
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
