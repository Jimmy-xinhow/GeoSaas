'use client'

import { useMemo, useState } from 'react'
import {
  User,
  CreditCard,
  Lock,
  AlertCircle,
  Coins,
  ArrowUp,
  ArrowDown,
  Clock,
  Shield,
  Wrench,
  Sparkles,
  Bot,
  Crown,
  CheckCircle2,
  Mail,
  KeyRound,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  useCredits,
  useCreditCheckout,
  useManagedCheckout,
  useManagedRefundRequest,
  useCancelSubscription,
  type ActiveSubscriptionInfo,
  type ManagedSubscriptionInfo,
  type BillingCycle,
} from '@/hooks/use-settings'

const PLAN_LIMITS: Record<string, { scans: number; sites: number; label: string; description: string }> = {
  FREE: { scans: 2, sites: 1, label: 'Free 方案', description: '每站 2 次掃描/月 | 1 個網站 | 1 次修復體驗' },
  STARTER: { scans: 6, sites: 1, label: 'Starter 方案 NT$390/月', description: '每站 6 次掃描/月 | 1 個網站 | AI 修復 30 次 | AI 內容 30 次 | 引用監控 20 題 | 每週 2 篇 Geovault 專屬內容' },
  PRO: { scans: 10, sites: 3, label: 'Pro 方案 NT$690/月', description: '每站 10 次掃描/月 | 3 個網站 | AI 修復 50 次 | AI 內容 50 次 | 引用監控 30 題 | 多平台 | 自動排程 | 每週 6 篇 Geovault 專屬內容' },
}

const SUBSCRIPTION_OPTIONS = [
  {
    plan: 'STARTER',
    name: 'Starter',
    monthlyPrice: 390,
    yearlyMonthlyPrice: 351,
    icon: Wrench,
    accent: 'from-blue-500 to-cyan-400',
    metrics: ['1 網站', '6 掃描/月', '30 AI 次數', '20 題監控'],
    description: '適合單一網站的基礎 GEO 自助優化。',
    features: [
      '1 個網站',
      '每站 6 次掃描/月',
      '基礎 GEO 報告',
      'llms.txt 託管',
      'AI 修復建議 30 次/月',
      'AI 內容生成 30 次/月',
      '知識庫 Q&A 10 次/月',
      'AI 引用監控 20 題/月 + 報告 2 次',
      '每週 2 篇 AI 專屬內容（Geovault 發布）',
    ],
  },
  {
    plan: 'PRO',
    name: 'Pro',
    monthlyPrice: 690,
    yearlyMonthlyPrice: 621,
    icon: Sparkles,
    accent: 'from-indigo-500 to-blue-400',
    metrics: ['3 網站', '10 掃描/月', '50 AI 次數', '30 題監控'],
    description: '適合需要多網站與進階監控的品牌。',
    features: [
      '3 個網站',
      '每站 10 次掃描/月',
      '完整 GEO 報告',
      'llms.txt 託管',
      'AI 修復建議 50 次/月',
      'AI 內容生成 50 次/月',
      '知識庫 Q&A 15 次/月',
      'AI 引用監控 30 題/月 + 報告 3 次',
      '每週 6 篇 AI 專屬內容（Geovault 發布）',
      '多平台發佈',
      '自動排程',
    ],
  },
] as const

const MANAGED_OPTIONS = [
  {
    plan: 'MANAGED_BASIC',
    name: 'GEO 入門代營運',
    englishName: 'GEOvault Managed Basic',
    monthlyPrice: 7800,
    yearlyMonthlyPrice: 7020,
    icon: Bot,
    accent: 'from-amber-400 to-orange-500',
    metrics: ['50 組題庫', '30 篇/月', '5 AI 平台'],
    description: '適合先建立 AI 搜尋基準，由專人完成第一輪品牌資料整理與基礎佈局。',
    deliverables: [
      '專人檢測 ChatGPT、Gemini、Claude、Perplexity、Copilot 基礎可見度',
      '專人設計 50 組核心 AI 搜尋問題庫',
      '整理品牌名稱、服務項目、服務地區、適合客群與差異化賣點',
      '轉成 AI 較容易理解的品牌敘述',
      '整理網站可讀性、FAQ 方向、品牌描述、結構化資料建議',
      '每月發布 30 篇可提供 AI 引用的品牌內容文章',
      '每月簡版可見度報告與一次基礎補強建議',
    ],
    exclusions: ['不含競品深度分析', '不含大量問題庫', '不含完整顧問月會', '不含退費保障'],
  },
  {
    plan: 'MANAGED_PRO',
    name: 'GEO 完整代營運',
    englishName: 'GEOvault Managed Pro',
    monthlyPrice: 15000,
    yearlyMonthlyPrice: 13500,
    icon: Crown,
    accent: 'from-amber-300 to-yellow-500',
    metrics: ['100 組題庫', '50 篇/月', '競品簡析'],
    description: '適合正式佈局 AI 搜尋曝光，由專人每月持續檢測、優化、追蹤與交付成果。',
    deliverables: [
      '品牌 AI 可見度完整診斷與 5 大 AI 平台追蹤',
      '專人設計 100 組推薦型、比較型、需求型、情境型問題庫',
      '完整建置品牌 AI 知識庫、服務說明、FAQ、適合對象與差異化內容',
      '每月代執行 GEO 優化、品牌內容補強、FAQ 補強與結構化資料方向',
      '每月發布 50 篇可提供 AI 引用的品牌內容文章',
      '每月 1 到 3 個主要競品 AI 可見度簡析',
      '完整成效月報、可見度變化紀錄與每月一次策略建議',
    ],
    exclusions: ['不保證每次 AI 都推薦品牌', '不以成交數或流量數作為退費依據', '不以單一 AI 回答認定成效'],
  },
] as const

function ManagedRefundRequestCard({
  subscriptions,
}: {
  subscriptions: ManagedSubscriptionInfo[]
}) {
  const [selectedOrderNo, setSelectedOrderNo] = useState(subscriptions[0]?.orderNo ?? '')
  const [requestedResolution, setRequestedResolution] = useState<'refund' | 'extension'>('extension')
  const [basis, setBasis] = useState('')
  const [acceptedReviewTerms, setAcceptedReviewTerms] = useState(false)
  const refundRequest = useManagedRefundRequest()

  const selectedOrder = useMemo(
    () => subscriptions.find((order) => order.orderNo === selectedOrderNo) ?? subscriptions[0],
    [selectedOrderNo, subscriptions],
  )

  const formatPaidAt = (paidAt: string | null) => {
    if (!paidAt) return '付款時間未記錄'
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(paidAt))
  }

  const handleSubmit = () => {
    if (!selectedOrder) return
    if (!acceptedReviewTerms) {
      toast.error('請先確認退費或延長補強審核條件')
      return
    }

    refundRequest.mutate(
      {
        orderNo: selectedOrder.orderNo,
        plan: selectedOrder.plan,
        requestedResolution,
        basis,
        acceptedReviewTerms,
      },
      {
        onSuccess: (data) => {
          toast.success(data.message)
          setBasis('')
          setAcceptedReviewTerms(false)
          setRequestedResolution('extension')
        },
        onError: (error: any) => {
          toast.error(error?.response?.data?.message || '申請送出失敗，請確認訂單資料')
        },
      },
    )
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-300" />
          代營運成效審核申請
        </CardTitle>
        <CardDescription>
          僅已付款的代營運月付方案會顯示此區塊。審核依雙方事前約定的問題庫、AI 平台範圍、檢測期間與可見度指標判斷。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="managed-order">代營運訂單</Label>
            <select
              id="managed-order"
              value={selectedOrderNo}
              onChange={(e) => setSelectedOrderNo(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {subscriptions.map((order) => (
                <option key={order.orderNo} value={order.orderNo}>
                  {order.orderNo} · {order.planLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="managed-resolution">申請項目</Label>
            <select
              id="managed-resolution"
              value={requestedResolution}
              onChange={(e) => setRequestedResolution(e.target.value as 'refund' | 'extension')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="extension">申請延長補強</option>
              <option value="refund">申請退費審核</option>
            </select>
          </div>
        </div>

        {selectedOrder && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-medium">{selectedOrder.planLabel}</div>
            <div className="mt-1 text-amber-200/80">
              NT${selectedOrder.amount.toLocaleString()} / 月 · {formatPaidAt(selectedOrder.paidAt)}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="managed-refund-basis">申請依據</Label>
          <Textarea
            id="managed-refund-basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            placeholder="請說明未達成效的依據，例如約定問題庫、平台範圍、檢測期間與報告結果。"
            className="min-h-28"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={acceptedReviewTerms}
            onChange={(e) => setAcceptedReviewTerms(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/20 bg-background"
          />
          <span>
            我了解本申請不以成交數、詢問數、流量數、單一平台、單一問題或單次 AI 回答作為審核依據。
          </span>
        </label>

        <Button
          className="w-full bg-amber-500 text-gray-950 hover:bg-amber-400"
          disabled={refundRequest.isPending || !acceptedReviewTerms || basis.trim().length < 20}
          onClick={handleSubmit}
        >
          {refundRequest.isPending ? '送出中...' : '送出申請'}
        </Button>
      </CardContent>
    </Card>
  )
}

type PendingCheckout =
  | {
      kind: 'self_service'
      plan: 'STARTER' | 'PRO'
      planLabel: string
      billingCycle: BillingCycle
      monthlyEquivalent: number
      total: number
    }
  | {
      kind: 'managed'
      plan: 'MANAGED_BASIC' | 'MANAGED_PRO'
      planLabel: string
      billingCycle: BillingCycle
      monthlyEquivalent: number
      total: number
    }

function getBillingCycleCopy(cycle: BillingCycle) {
  return cycle === 'yearly'
    ? { label: '年繳', periodTimes: '4 期', cadence: '每年扣款一次，最多四年' }
    : { label: '月繳', periodTimes: '48 期', cadence: '每月扣款一次，最多四年' }
}

function CheckoutConfirmModal({
  checkout,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  checkout: PendingCheckout
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cycle = getBillingCycleCopy(checkout.billingCycle)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/40">
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-amber-300" />
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">訂閱扣款確認</p>
              <h3 className="mt-1 text-2xl font-bold text-white">{checkout.planLabel}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                本方案採藍新信用卡定期定額。確認後才會前往藍新金流頁面輸入信用卡資料。
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-gray-500">付款方式</p>
              <p className="mt-1 font-semibold text-white">{cycle.label}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-gray-500">期數</p>
              <p className="mt-1 font-semibold text-white">{cycle.periodTimes}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-gray-500">本次扣款</p>
              <p className="mt-1 font-semibold text-white">NT${checkout.total.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] p-4 text-sm leading-relaxed text-amber-50">
            <p className="font-semibold">重要說明</p>
            <ul className="mt-2 space-y-1.5 text-amber-100/90">
              <li>本訂閱為四年期數設定：{cycle.cadence}。</li>
              <li>你可以在後台設定頁隨時終止訂閱，終止後不會再繼續扣款。</li>
              <li>終止是停止未來扣款，不等同於自動退費；退費仍依服務條款與審核條件處理。</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11 border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={onCancel}>
              返回
            </Button>
            <Button className="h-11 bg-blue-600 px-6 text-white hover:bg-blue-700" disabled={isSubmitting} onClick={onConfirm}>
              {isSubmitting ? '建立付款中...' : '確認並前往付款'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActiveSubscriptionsCard({
  subscriptions,
  onCancel,
  isCancelling,
}: {
  subscriptions: ActiveSubscriptionInfo[]
  onCancel: (subscription: ActiveSubscriptionInfo) => void
  isCancelling: boolean
}) {
  if (subscriptions.length === 0) return null

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <CreditCard className="h-5 w-5 text-blue-300" />
          目前定期定額訂閱
        </CardTitle>
        <CardDescription>
          訂閱採四年期數設定，月繳為 48 期、年繳為 4 期；可隨時終止未來扣款。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {subscriptions.map((subscription) => {
          const cycle = getBillingCycleCopy(subscription.billingCycle)
          return (
            <div key={subscription.orderNo} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-gray-950/30 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-white">{subscription.planLabel}</h4>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-200">
                    {subscription.type === 'managed' ? '代營運' : '自助訂閱'}
                  </span>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-gray-300">
                    {cycle.label} / {cycle.periodTimes}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  訂單 {subscription.orderNo} · 每期 NT${subscription.amount.toLocaleString()} · 可終止後續扣款
                </p>
              </div>
              <Button
                variant="outline"
                className="h-10 border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                disabled={isCancelling}
                onClick={() => onCancel(subscription)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                終止扣款
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile()
  const { data: subscription, isLoading: subLoading, error: subError } = useSubscription()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const createCheckout = useCreateCheckout()
  const managedCheckout = useManagedCheckout()
  const cancelSubscription = useCancelSubscription()
  const { data: creditData } = useCredits()
  const creditCheckout = useCreditCheckout()

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
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [managedBillingCycle, setManagedBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null)

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

  const confirmPendingCheckout = () => {
    if (!pendingCheckout) return
    if (pendingCheckout.kind === 'managed') {
      managedCheckout.mutate(
        { plan: pendingCheckout.plan, billingCycle: pendingCheckout.billingCycle },
        { onError: (error: any) => toast.error(error?.response?.data?.message || '建立代營運付款失敗，請稍後再試') },
      )
      return
    }

    createCheckout.mutate(
      { plan: pendingCheckout.plan, billingCycle: pendingCheckout.billingCycle },
      { onError: (error: any) => toast.error(error?.response?.data?.message || '建立訂閱付款失敗，請稍後再試') },
    )
  }

  const handleCancelSubscription = (subscriptionItem: ActiveSubscriptionInfo) => {
    const cycle = getBillingCycleCopy(subscriptionItem.billingCycle)
    const confirmed = window.confirm(
      `確定要終止「${subscriptionItem.planLabel}」後續扣款嗎？\n\n此訂閱為${cycle.label} ${cycle.periodTimes}。終止後不會再繼續扣款；此操作不等同於自動退費。`,
    )
    if (!confirmed) return

    cancelSubscription.mutate(subscriptionItem.orderNo, {
      onSuccess: (result) => toast.success(result.message || '已終止後續扣款'),
      onError: (error: any) => toast.error(error?.response?.data?.message || '終止扣款失敗，請稍後再試'),
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-hidden">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.08] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Account</p>
                      <p className="truncate text-lg font-bold text-white">{profileName || '尚未設定姓名'}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-200">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Login Email</p>
                      <p className="truncate text-lg font-bold text-white">{profileEmail || '尚未設定信箱'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
                className="h-11 bg-blue-600 text-white hover:bg-blue-700"
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-blue-500/20 border border-blue-500/30">
                <div className="min-w-0">
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
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                      <Wrench className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">本月掃描</p>
                      <p className="text-2xl font-bold">
                        {subscription?.usage?.scansThisMonth ?? 0}
                        {planInfo.scans > 0 ? `/${planInfo.scans}` : ' / 無限'}
                      </p>
                    </div>
                  </div>
                  {planInfo.scans > 0 && (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${Math.min(
                            100,
                            ((subscription?.usage?.scansThisMonth ?? 0) / planInfo.scans) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">已用網站數</p>
                      <p className="text-2xl font-bold">
                        {subscription?.usage?.sitesCount ?? 0}
                        {planInfo.sites > 0 ? `/${planInfo.sites}` : ' / 無限'}
                      </p>
                    </div>
                  </div>
                  {planInfo.sites > 0 && (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{
                          width: `${Math.min(
                            100,
                            ((subscription?.usage?.sitesCount ?? 0) / planInfo.sites) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Self-service SaaS</p>
                    <h3 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">選擇自助訂閱方案</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">請直接選擇要付款的方案，不會自動替你決定下一檔。</p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-lg border border-white/10 bg-white/5 p-1">
                    {[
                      ['monthly', '月繳'] as const,
                      ['yearly', '年繳'] as const,
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSubscriptionBillingCycle(value)}
                        className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                          subscriptionBillingCycle === value
                            ? 'bg-white text-gray-950'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mx-auto mt-6 grid max-w-[72rem] grid-cols-1 gap-4 xl:grid-cols-2">
                  {SUBSCRIPTION_OPTIONS.map((option) => {
                    const monthlyEquivalent = subscriptionBillingCycle === 'yearly'
                      ? option.yearlyMonthlyPrice
                      : option.monthlyPrice
                    const total = subscriptionBillingCycle === 'yearly'
                      ? option.yearlyMonthlyPrice * 12
                      : option.monthlyPrice
                    const savings = (option.monthlyPrice - option.yearlyMonthlyPrice) * 12
                    const isCurrentPlan = plan === option.plan

                    return (
                      <div
                        key={option.plan}
                        className={`h-full overflow-hidden rounded-xl border ${
                          isCurrentPlan
                            ? 'border-blue-500/40 bg-blue-500/10'
                            : 'border-white/10 bg-gray-950/20'
                        }`}
                      >
                        <div className={`h-1.5 bg-gradient-to-r ${option.accent}`} />
                        <div className="flex h-full flex-col p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${option.accent} text-white shadow-lg shadow-blue-950/20`}>
                                <option.icon className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="text-2xl font-bold tracking-tight text-white">{option.name}</h4>
                                <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                              </div>
                            </div>
                            {isCurrentPlan && (
                              <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                                目前
                              </span>
                            )}
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {option.metrics.map((metric) => (
                              <div key={metric} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                                <p className="text-xs font-semibold text-blue-200">{metric}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4">
                            <span className="text-3xl font-bold text-white">NT${monthlyEquivalent}</span>
                            <span className="ml-1 text-sm text-muted-foreground">/ 月</span>
                          </div>
                          {subscriptionBillingCycle === 'yearly' && (
                            <p className="mt-1 text-sm text-green-400">
                              年繳 NT${total.toLocaleString()}，省 NT${savings.toLocaleString()}
                            </p>
                          )}
                          <ul className="mt-4 grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
                            {option.features.map((feature) => (
                              <li key={feature} className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                          <Button
                            className="mt-auto h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
                            disabled={createCheckout.isPending || isCurrentPlan}
                            onClick={() => setPendingCheckout({
                              kind: 'self_service',
                              plan: option.plan,
                              planLabel: option.name,
                              billingCycle: subscriptionBillingCycle,
                              monthlyEquivalent,
                              total,
                            })}
                          >
                            {isCurrentPlan ? '目前方案' : createCheckout.isPending ? '建立付款中...' : '選擇方案'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Managed Service</p>
                    <h3 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">選擇代營運方案</h3>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      代營運不是平台功能加價，而是專人協助完成問題庫、知識庫、追蹤、報告與補強。
                    </p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-lg border border-amber-500/20 bg-white/5 p-1">
                    {[
                      ['monthly', '月繳'] as const,
                      ['yearly', '年繳'] as const,
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManagedBillingCycle(value)}
                        className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                          managedBillingCycle === value
                            ? 'bg-amber-400 text-gray-950'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mx-auto mt-6 grid max-w-[72rem] grid-cols-1 gap-4 xl:grid-cols-2">
                  {MANAGED_OPTIONS.map((option) => {
                    const monthlyEquivalent = managedBillingCycle === 'yearly'
                      ? option.yearlyMonthlyPrice
                      : option.monthlyPrice
                    const total = managedBillingCycle === 'yearly'
                      ? option.yearlyMonthlyPrice * 12
                      : option.monthlyPrice
                    const savings = (option.monthlyPrice - option.yearlyMonthlyPrice) * 12

                    return (
                      <div key={option.plan} className="h-full overflow-hidden rounded-xl border border-white/10 bg-gray-950/30">
                        <div className={`h-1.5 bg-gradient-to-r ${option.accent}`} />
                        <div className="flex h-full flex-col p-5">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${option.accent} text-gray-950 shadow-lg shadow-amber-950/20`}>
                              <option.icon className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-amber-300">{option.englishName}</p>
                              <h4 className="mt-1 text-2xl font-bold tracking-tight text-white">{option.name}</h4>
                              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{option.description}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {option.metrics.map((metric) => (
                              <div key={metric} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-center">
                                <p className="text-xs font-semibold text-amber-200">{metric}</p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4">
                            <span className="text-3xl font-bold text-white">NT${monthlyEquivalent.toLocaleString()}</span>
                            <span className="ml-1 text-sm text-muted-foreground">/ 月</span>
                          </div>
                          {managedBillingCycle === 'yearly' && (
                            <p className="mt-1 text-sm text-green-400">
                              年繳 NT${total.toLocaleString()}，省 NT${savings.toLocaleString()}
                            </p>
                          )}

                          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <p className="text-xs font-semibold text-gray-500">服務細項</p>
                            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-300">
                              {option.deliverables.map((item) => (
                                <li key={item} className="flex gap-2">
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {option.exclusions.map((item) => (
                              <span key={item} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-gray-400 ring-1 ring-white/10">
                                {item}
                              </span>
                            ))}
                          </div>

                          <Button
                            className="mt-auto h-11 w-full bg-amber-500 text-gray-950 hover:bg-amber-400"
                            disabled={managedCheckout.isPending}
                            onClick={() => setPendingCheckout({
                              kind: 'managed',
                              plan: option.plan,
                              planLabel: option.name,
                              billingCycle: managedBillingCycle,
                              monthlyEquivalent,
                              total,
                            })}
                          >
                            {managedCheckout.isPending ? '建立付款中...' : '選擇代營運方案'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ActiveSubscriptionsCard
        subscriptions={subscription?.activeSubscriptions ?? []}
        onCancel={handleCancelSubscription}
        isCancelling={cancelSubscription.isPending}
      />

      {subscription?.managedSubscriptions && subscription.managedSubscriptions.length > 0 && (
        <ManagedRefundRequestCard subscriptions={subscription.managedSubscriptions} />
      )}

      {/* Credits card */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-yellow-400" />
            AI 生成點數
          </CardTitle>
          <CardDescription>手動生成 AI 內容所需的點數餘額</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-yellow-300/80">Credits</p>
                  <p className="mt-1 text-4xl font-bold text-yellow-300">{creditData?.credits ?? 0}</p>
                  <p className="text-xs text-yellow-400/70">可用點數</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-200">
                  <Coins className="h-6 w-6" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-300/80">Monthly Free</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    {creditData?.freeGenerations.remaining ?? 0}/{creditData?.freeGenerations.total ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">本月免費額度</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>
              {(creditData?.freeGenerations.total ?? 0) > 0 && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{
                      width: `${Math.min(
                        100,
                        ((creditData?.freeGenerations.remaining ?? 0) / (creditData?.freeGenerations.total ?? 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.07] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-orange-300/80">Expiring</p>
                  <p className="mt-1 text-3xl font-bold text-orange-300">{creditData?.expiringSoon ?? 0}</p>
                  <p className="text-xs text-muted-foreground">30 天內到期</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/20 text-orange-200">
                  <Clock className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Top-up buttons */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">充值點數</p>
                <p className="text-xs text-muted-foreground">1 點 = NT$5，購買後 12 個月內有效</p>
              </div>
              <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-300">
                Top up
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { points: 50, price: 250 },
                { points: 100, price: 500 },
                { points: 200, price: 1000 },
              ].map((pkg) => (
                <Button
                  key={pkg.points}
                  variant="outline"
                  className="h-12 justify-between border-white/10 bg-gray-950/30 px-4 text-left hover:bg-white/10"
                  disabled={creditCheckout.isPending}
                  onClick={() => creditCheckout.mutate(pkg.points)}
                >
                  <span className="font-semibold">{pkg.points} 點</span>
                  <span className="text-muted-foreground">NT${pkg.price}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Transaction history */}
          {creditData?.transactions && creditData.transactions.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">交易記錄</p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {creditData.transactions.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5 text-xs">
                    <div className="flex items-center gap-2">
                      {tx.type === 'topup' ? (
                        <ArrowUp className="h-3 w-3 text-green-400" />
                      ) : tx.type === 'expire' ? (
                        <Clock className="h-3 w-3 text-orange-400" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-red-400" />
                      )}
                      <span className="text-gray-400">{tx.description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={tx.amount > 0 ? 'text-green-400' : 'text-red-400'}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                      <span className="text-gray-600 w-12 text-right">餘 {tx.balance}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing info */}
          <div className="text-xs text-muted-foreground border-t border-white/5 pt-3 space-y-1">
            <p>訂閱用戶每月贈送 10 次免費生成額度，超額後依點數扣除</p>
            <p>扣點：AI 內容/知識庫/缺口填補 = 2 點，修復/llms.txt = 1 點，品牌擴散 = 2 點/平台</p>
          </div>
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
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-200">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-100">帳號安全狀態</p>
                <p className="mt-1 text-sm leading-relaxed text-emerald-100/70">
                  建議使用至少 8 個字元，並避免與其他服務共用密碼。
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
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
          </div>
          {passwordError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{passwordSuccess}</p>
          )}
          <Button
            className="h-11 bg-blue-600 text-white hover:bg-blue-700"
            disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {changePassword.isPending ? '更新中...' : '更新密碼'}
          </Button>
        </CardContent>
      </Card>
      {pendingCheckout && (
        <CheckoutConfirmModal
          checkout={pendingCheckout}
          isSubmitting={createCheckout.isPending || managedCheckout.isPending}
          onCancel={() => setPendingCheckout(null)}
          onConfirm={confirmPendingCheckout}
        />
      )}
    </div>
  )
}
