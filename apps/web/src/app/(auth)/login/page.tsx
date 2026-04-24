'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { GeovaultLogoCompact } from '@/components/logo'
import { useLogin } from '@/hooks/use-auth'
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

const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const loginMutation = useLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    loginMutation.mutate(data, {
      onSuccess: () => {
        toast.success('登入成功')
        router.push('/dashboard')
      },
      onError: (error: any) => {
        const message =
          error?.response?.data?.message || '登入失敗，請檢查您的帳號密碼'
        toast.error(message)
      },
    })
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mb-2 flex justify-center"><GeovaultLogoCompact className="h-9 w-auto" /></div>
        <CardTitle className="text-2xl">歡迎回來</CardTitle>
        <CardDescription>登入您的帳號</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密碼</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-blue-600 hover:underline"
              >
                忘記密碼？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="請輸入密碼"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? '登入中...' : '登入'}
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

        <GoogleSignInButton text="signin_with" redirectTo="/dashboard" />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          還沒有帳號？{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            立即註冊
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
