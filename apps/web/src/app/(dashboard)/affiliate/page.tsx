'use client'

import { useState } from 'react'
import { Copy, HandCoins, Link2, MousePointerClick, Send, UserCheck, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useAffiliateDashboard,
  useAffiliateReferralDetails,
  useAffiliateStatus,
  useApplyAffiliate,
  useRequestAffiliateWithdrawal,
} from '@/hooks/use-affiliate'

function money(value?: number) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`
}

function dateTime(value?: string | null) {
  if (!value) return '尚未'
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function commissionStatus(status?: string) {
  const labels: Record<string, string> = {
    pending: '保留期中',
    approved: '可提領',
    paid: '已付款',
    clawed_back: '已扣回',
  }
  return labels[status || ''] || status || '未知'
}

function clickStatus(status?: string) {
  return status === 'registered' ? '已註冊' : '已點擊'
}

const tierGuides = [
  {
    name: '標準',
    rate: '10%',
    condition: '通過聯盟申請審核後啟用。',
    note: '適合剛開始推廣的顧問、內容創作者、社群主與網站服務商。',
  },
  {
    name: '金牌',
    rate: '15%',
    condition: '近 30 天達 3 筆有效付費訂單，或累積有效佣金達 NT$ 3,000。',
    note: '需無退款異常、無誤導推廣或違規流量，採人工審核升級。',
  },
  {
    name: '白金',
    rate: '20%',
    condition: '近 60 天達 10 筆有效付費訂單，或累積有效佣金達 NT$ 15,000。',
    note: '適合代理商、長期合作夥伴與高品質 B2B 推薦來源，採人工審核升級。',
  },
]

export default function AffiliatePage() {
  const statusQuery = useAffiliateStatus()
  const affiliate = statusQuery.data?.affiliate
  const dashboardQuery = useAffiliateDashboard(affiliate?.status === 'approved')
  const referralDetailsQuery = useAffiliateReferralDetails(affiliate?.status === 'approved')
  const applyMutation = useApplyAffiliate()
  const withdrawalMutation = useRequestAffiliateWithdrawal()
  const [form, setForm] = useState({
    realName: '',
    contactEmail: '',
    websiteUrl: '',
    promotionChannel: '',
    audienceDescription: '',
    bankName: '',
    bankBranch: '',
    bankAccountNumber: '',
    bankAccountName: '',
  })
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const updateForm = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const submitApplication = () => {
    if (!form.realName.trim()) {
      toast.error('請填寫真實姓名')
      return
    }
    applyMutation.mutate(form, {
      onSuccess: () => toast.success('已送出聯盟行銷申請，等待後台審核'),
      onError: (error: any) => toast.error(error?.response?.data?.message || '送出失敗'),
    })
  }

  const requestWithdrawal = () => {
    const amount = Number(withdrawAmount)
    if (!Number.isFinite(amount) || amount < 1000) {
      toast.error('提領金額至少 NT$ 1,000')
      return
    }
    withdrawalMutation.mutate({ amount, type: 'bank_transfer' }, {
      onSuccess: (data: any) => {
        toast.success(`已送出提領申請：${money(data.amount)}`)
        setWithdrawAmount('')
      },
      onError: (error: any) => toast.error(error?.response?.data?.message || '提領申請失敗'),
    })
  }

  if (statusQuery.isLoading) {
    return <div className="p-8 text-slate-300">載入聯盟行銷資料中...</div>
  }

  if (!statusQuery.data?.hasApplication || affiliate?.status === 'rejected' || affiliate?.status === 'suspended') {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold text-white">聯盟行銷</h1>
          <p className="mt-2 text-sm text-slate-300">
            分享 Geovault 給客戶或社群，對方完成付費後，你可以取得佣金。
          </p>
        </div>
        {affiliate?.status === 'rejected' && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            上次申請未通過：{affiliate.rejectionReason || '未提供原因'}。你可以修正資料後重新送出。
          </div>
        )}
        {affiliate?.status === 'suspended' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            目前帳號已暫停聯盟資格，請聯絡管理員。
          </div>
        )}
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle>級距條件</CardTitle>
            <CardDescription className="text-slate-400">
              級距不是自動無條件升級，會依有效訂單、有效佣金、退款率與推廣品質由後台審核。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {tierGuides.map((tier) => (
              <div key={tier.name} className="rounded-lg border border-white/10 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{tier.name}</p>
                  <p className="text-2xl font-bold text-emerald-300">{tier.rate}</p>
                </div>
                <p className="mt-3 text-sm text-slate-200">{tier.condition}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{tier.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle>申請成為聯盟夥伴</CardTitle>
            <CardDescription className="text-slate-400">
              標準佣金 10%，後台可依合作狀況調整為金牌 15% 或白金 20%。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>真實姓名</Label>
              <Input value={form.realName} onChange={(e) => updateForm('realName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>聯絡 Email</Label>
              <Input value={form.contactEmail} onChange={(e) => updateForm('contactEmail', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>網站或社群連結</Label>
              <Input value={form.websiteUrl} onChange={(e) => updateForm('websiteUrl', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>主要推廣渠道</Label>
              <Input value={form.promotionChannel} onChange={(e) => updateForm('promotionChannel', e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>受眾與推廣方式</Label>
              <Textarea value={form.audienceDescription} onChange={(e) => updateForm('audienceDescription', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>銀行名稱</Label>
              <Input value={form.bankName} onChange={(e) => updateForm('bankName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>分行</Label>
              <Input value={form.bankBranch} onChange={(e) => updateForm('bankBranch', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>帳號</Label>
              <Input value={form.bankAccountNumber} onChange={(e) => updateForm('bankAccountNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>戶名</Label>
              <Input value={form.bankAccountName} onChange={(e) => updateForm('bankAccountName', e.target.value)} />
            </div>
            <Button className="md:col-span-2" onClick={submitApplication} disabled={applyMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              送出申請
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (affiliate?.status === 'pending') {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle>聯盟申請審核中</CardTitle>
            <CardDescription className="text-slate-400">
              審核通過後，這裡會顯示你的專屬連結、佣金與提領狀態。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const dashboard = dashboardQuery.data
  const referralDetails = referralDetailsQuery.data
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-white">聯盟行銷</h1>
        <p className="mt-2 text-sm text-slate-300">你的專屬追蹤碼：{affiliate?.affiliateCode}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm">點擊</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{affiliate?.totalClicks || 0}</CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm">註冊</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{affiliate?.totalSignups || 0}</CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm">累積佣金</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{money(affiliate?.totalCommissionEarned)}</CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm">可提領</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{money(dashboard?.availableCommission)}</CardContent>
        </Card>
      </div>

      <Card className="border-slate-700 bg-slate-900 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> 專屬推廣連結</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input value={dashboard?.trackingLink || ''} readOnly />
          <Button onClick={() => navigator.clipboard.writeText(dashboard?.trackingLink || '').then(() => toast.success('已複製'))}>
            <Copy className="mr-2 h-4 w-4" /> 複製
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900 text-white">
        <CardHeader>
          <CardTitle>推薦明細與連結使用狀態</CardTitle>
          <CardDescription className="text-slate-400">
            追蹤最近的點擊、註冊與付費佣金，協助你判斷哪個來源頁與推廣方式有效。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {referralDetailsQuery.isLoading && <p className="text-sm text-slate-400">載入推薦明細中...</p>}
          {!referralDetailsQuery.isLoading && referralDetails && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <MousePointerClick className="h-4 w-4" />
                    連結點擊
                  </div>
                  <p className="mt-2 text-2xl font-bold">{referralDetails.summary.totalClicks}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <UserCheck className="h-4 w-4" />
                    推薦註冊
                  </div>
                  <p className="mt-2 text-2xl font-bold">{referralDetails.summary.totalSignups}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <WalletCards className="h-4 w-4" />
                    付費轉換
                  </div>
                  <p className="mt-2 text-2xl font-bold">{referralDetails.summary.totalConversions}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">待確認佣金</div>
                  <p className="mt-2 text-2xl font-bold">{money(referralDetails.summary.pendingCommission)}</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">來源頁成效</h3>
                    <p className="mt-1 text-xs text-slate-400">依點擊數排序，方便比較不同貼文、頁面或廣告入口。</p>
                  </div>
                  <div className="space-y-2">
                    {referralDetails.landingPages.length === 0 && (
                      <p className="rounded-lg bg-slate-950 p-3 text-sm text-slate-400">目前尚無來源頁紀錄。</p>
                    )}
                    {referralDetails.landingPages.map((item) => (
                      <div key={item.landingPage} className="rounded-lg border border-white/10 bg-slate-950 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium">{item.landingPage}</p>
                          <span className="shrink-0 rounded bg-blue-500/15 px-2 py-1 text-xs text-blue-200">
                            {item.clicks} 次
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">最近點擊</h3>
                    <p className="mt-1 text-xs text-slate-400">顯示連結是否被使用，以及該點擊是否已轉成註冊。</p>
                  </div>
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {referralDetails.clicks.length === 0 && (
                      <p className="rounded-lg bg-slate-950 p-3 text-sm text-slate-400">目前尚無點擊紀錄。</p>
                    )}
                    {referralDetails.clicks.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10 bg-slate-950 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.landingPage}</p>
                            <p className="mt-1 text-xs text-slate-400">點擊：{dateTime(item.clickedAt)}</p>
                          </div>
                          <span className={item.status === 'registered' ? 'rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200' : 'rounded bg-slate-700 px-2 py-1 text-xs text-slate-200'}>
                            {clickStatus(item.status)}
                          </span>
                        </div>
                        {item.convertedAt && <p className="mt-2 text-xs text-emerald-200">註冊：{dateTime(item.convertedAt)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">最近註冊</h3>
                    <p className="mt-1 text-xs text-slate-400">個資已遮罩，保留付費狀態供你追蹤轉換品質。</p>
                  </div>
                  <div className="space-y-2">
                    {referralDetails.signups.length === 0 && (
                      <p className="rounded-lg bg-slate-950 p-3 text-sm text-slate-400">目前尚無推薦註冊。</p>
                    )}
                    {referralDetails.signups.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10 bg-slate-950 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium">{item.displayName} · {item.email}</p>
                            <p className="mt-1 text-xs text-slate-400">註冊：{dateTime(item.signedUpAt)} · 目前方案：{item.plan}</p>
                          </div>
                          <span className={item.hasPaid ? 'rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200' : 'rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-200'}>
                            {item.hasPaid ? '已付費' : '未付費'}
                          </span>
                        </div>
                        {item.hasPaid && (
                          <p className="mt-2 text-xs text-slate-300">
                            最近付款：{item.latestPaidPlan} · {money(item.latestPaidAmount || 0)} · {dateTime(item.latestPaidAt)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">付費與佣金</h3>
                    <p className="mt-1 text-xs text-slate-400">列出已產生佣金的付費訂單與目前結算狀態。</p>
                  </div>
                  <div className="space-y-2">
                    {referralDetails.commissions.length === 0 && (
                      <p className="rounded-lg bg-slate-950 p-3 text-sm text-slate-400">目前尚無付費佣金紀錄。</p>
                    )}
                    {referralDetails.commissions.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10 bg-slate-950 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium">{item.referredUser.displayName} · {item.referredUser.email}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {item.orderPlan} · 付款 {money(item.paymentAmount)} · {dateTime(item.paidAt)}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-semibold">{money(item.commissionAmount)}</p>
                            <p className="mt-1 text-xs text-slate-400">{item.commissionRate}% · {commissionStatus(item.status)}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">保留期至：{dateTime(item.lockedUntil)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle>最近佣金</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(dashboard?.recentCommissions || []).length === 0 && <p className="text-sm text-slate-400">目前尚無佣金紀錄。</p>}
            {(dashboard?.recentCommissions || []).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-950 p-3 text-sm">
                <div>
                  <div className="font-medium">{item.order?.plan || '方案付款'}</div>
                  <div className="text-slate-400">{item.status} · {item.commissionRate}%</div>
                </div>
                <div className="font-semibold">{money(item.commissionAmount)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-700 bg-slate-900 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5" /> 申請提領</CardTitle>
            <CardDescription className="text-slate-400">已過 14 天保留期的佣金才能提領。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="提領金額" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
            <Button className="w-full" onClick={requestWithdrawal} disabled={withdrawalMutation.isPending}>
              送出提領申請
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
