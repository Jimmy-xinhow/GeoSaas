'use client'

import { useState } from 'react'
import { User, CreditCard, Lock, AlertCircle } from 'lucide-react'
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
  useProfile,
  useUpdateProfile,
  useChangePassword,
  useSubscription,
  useCreateCheckout,
} from '@/hooks/use-settings'

const PLAN_LIMITS: Record<string, { scans: number; sites: number; label: string; description: string }> = {
  FREE: { scans: 2, sites: 1, label: 'Free 方案', description: '每站 2 次掃描/月 | 1 個網站 | 1 次修復體驗' },
  STARTER: { scans: 6, sites: 1, label: 'Starter 方案 NT$390/月', description: '每站 6 次掃描/月 | 1 個網站 | AI 修復 30 次 | AI 內容 30 次 | 引用監控 20 題' },
  PRO: { scans: 10, sites: 3, label: 'Pro 方案 NT$690/月', description: '每站 10 次掃描/月 | 3 個網站 | AI 修復 50 次 | AI 內容 50 次 | 引用監控 30 題 | 多平台 | 自動排程' },
}

export default function SettingsPage() {
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: subscription, isLoading: subLoading, error: subError } = useSubscription()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const createCheckout = useCreateCheckout()

  if (profileError) {
    toast.error('無法載入個人資料', { id: 'profile-error' })
  }
  if (subError) {
    toast.error('無法載入訂閱資訊', { id: 'sub-error' })
  }

  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileInitialized, setProfileInitialized] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Initialize form with profile data once loaded
  if (profile && !profileInitialized) {
    setProfileName(profile.name || '')
    setProfileEmail(profile.email || '')
    setProfileInitialized(true)
  }

  const plan = subscription?.plan || profile?.plan || 'FREE'
  const planInfo = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE

  const handleSaveProfile = () => {
    updateProfile.mutate({ name: profileName, email: profileEmail })
  }

  const handleChangePassword = () => {
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 8) {
      setPasswordError('新密碼至少需要 8 個字元')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('新密碼與確認密碼不一致')
      return
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setPasswordSuccess('密碼已更新成功')
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        },
        onError: (error: any) => {
          setPasswordError(error.response?.data?.message || '密碼更新失敗，請確認當前密碼是否正確')
        },
      }
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">設定</h1>
        <p className="text-muted-foreground mt-1">管理您的帳號和偏好設定</p>
      </div>

      {/* Profile card */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            個人資訊
          </CardTitle>
          <CardDescription>更新您的個人資料和聯絡資訊</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileLoading ? (
            <div className="space-y-4">
              <div className="h-10 bg-white/10 rounded animate-pulse" />
              <div className="h-10 bg-white/10 rounded animate-pulse" />
            </div>
          ) : profileError ? (
            <div className="flex items-center gap-2 text-sm text-red-600 py-4">
              <AlertCircle className="h-4 w-4" />
              <span>無法載入個人資料，請重新整理頁面</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-name">姓名</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">電子郵件</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                />
              </div>
              {updateProfile.isSuccess && (
                <p className="text-sm text-green-600">個人資料已儲存</p>
              )}
              {updateProfile.isError && (
                <p className="text-sm text-red-600">
                  {(updateProfile.error as any)?.response?.data?.message || '儲存失敗'}
                </p>
              )}
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={updateProfile.isPending}
                onClick={handleSaveProfile}
              >
                {updateProfile.isPending ? '儲存中...' : '儲存'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Subscription card */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            方案資訊
          </CardTitle>
          <CardDescription>您的目前訂閱方案和使用情況</CardDescription>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="space-y-4">
              <div className="h-20 bg-white/10 rounded animate-pulse" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-16 bg-white/10 rounded animate-pulse" />
                <div className="h-16 bg-white/10 rounded animate-pulse" />
              </div>
            </div>
          ) : subError ? (
            <div className="flex items-center gap-2 text-sm text-red-600 py-4">
              <AlertCircle className="h-4 w-4" />
              <span>無法載入訂閱資訊，請重新整理頁面</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg bg-blue-500/20 border border-blue-500/30">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-blue-300">
                      {planInfo.label}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
                      目前方案
                    </span>
                  </div>
                  <p className="text-sm text-blue-400 mt-1">
                    {planInfo.description}
                  </p>
                </div>
                {plan !== 'ENTERPRISE' && (
                  <Button
                    variant="outline"
                    disabled={createCheckout.isPending}
                    onClick={() => {
                      const nextPlan = plan === 'FREE' ? 'STARTER' : plan === 'STARTER' ? 'PRO' : 'ENTERPRISE';
                      createCheckout.mutate(nextPlan);
                    }}
                  >
                    升級方案
                  </Button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-white/10">
                  <p className="text-sm text-muted-foreground">本月掃描</p>
                  <p className="text-2xl font-bold">
                    {subscription?.usage?.scansThisMonth ?? 0}
                    {planInfo.scans > 0 ? `/${planInfo.scans}` : ' / 無限'}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-white/10">
                  <p className="text-sm text-muted-foreground">已用網站數</p>
                  <p className="text-2xl font-bold">
                    {subscription?.usage?.sitesCount ?? 0}
                    {planInfo.sites > 0 ? `/${planInfo.sites}` : ' / 無限'}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Password card */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            密碼修改
          </CardTitle>
          <CardDescription>確保您的帳號安全</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">當前密碼</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="請輸入當前密碼"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密碼</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="至少 8 個字元"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">確認新密碼</Label>
            <Input
              id="confirm-new-password"
              type="password"
              placeholder="再次輸入新密碼"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordError && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-green-600">{passwordSuccess}</p>
          )}
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            {changePassword.isPending ? '更新中...' : '更新密碼'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
