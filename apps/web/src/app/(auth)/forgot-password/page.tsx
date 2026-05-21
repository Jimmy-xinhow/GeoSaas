'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email || isSubmitting) return

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post<{ devResetUrl?: string }>('/auth/forgot-password', { email })
      setDevResetUrl(data.devResetUrl ?? null)
      setSubmitted(true)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || '無法送出重設密碼要求，請稍後再試')
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
        <CardTitle className="text-2xl">忘記密碼</CardTitle>
        <CardDescription>
          {submitted ? '請檢查你的信箱' : '輸入註冊 Email，我們會寄出密碼重設連結'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-sm text-gray-400">
              如果 <strong className="text-white">{email}</strong> 已註冊，重設連結會在幾分鐘內送達。
            </p>
            <p className="text-xs text-gray-500">
              連結 1 小時後失效，且只能使用一次。
            </p>
            {devResetUrl ? (
              <a href={devResetUrl} className="block text-sm text-blue-300 underline">
                本地測試用重設密碼連結
              </a>
            ) : null}
            <Link href="/login">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回登入
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">電子郵件</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
              <Mail className="h-4 w-4 mr-2" />
              {isSubmitting ? '送出中...' : '發送重設連結'}
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
