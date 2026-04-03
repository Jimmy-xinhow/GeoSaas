'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    // For now, just show confirmation. Email service not yet configured.
    setSubmitted(true)
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mb-2 flex justify-center"><GeovaultLogoCompact className="h-9 w-auto" /></div>
        <CardTitle className="text-2xl">忘記密碼</CardTitle>
        <CardDescription>
          {submitted ? '已收到你的請求' : '輸入你的 Email，我們將協助你重設密碼'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-sm text-gray-400">
              如果 <strong className="text-white">{email}</strong> 已註冊，
              我們會寄送密碼重設連結到你的信箱。
            </p>
            <p className="text-xs text-gray-500">
              若沒收到信件，請聯繫客服：hello@geovault.app
            </p>
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
                placeholder="請輸入您的 Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              <Mail className="h-4 w-4 mr-2" />
              發送重設連結
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
