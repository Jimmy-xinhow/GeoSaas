'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, HandCoins, PauseCircle, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  AffiliateSettings,
  useAdminAffiliateCommissions,
  useAdminAffiliateOverview,
  useAdminAffiliates,
  useAdminAffiliateSettings,
  useAdminAffiliateWithdrawals,
  useProcessAffiliateWithdrawal,
  useReviewAffiliate,
  useSuspendAffiliate,
  useUpdateAffiliateSettings,
  useUpdateAffiliateTier,
} from '@/hooks/use-affiliate'

function money(value?: number) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`
}

function pct(value?: number) {
  return `${Number(value || 0).toLocaleString('zh-TW')}%`
}

const statusLabel: Record<string, string> = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已拒絕',
  suspended: '已停權',
  processing: '處理中',
  completed: '已完成',
  paid: '已付款',
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function BoolRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-blue-500"
      />
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-xs text-slate-400">{description}</span>
      </span>
    </label>
  )
}

export default function AdminAffiliatesPage() {
  const [status, setStatus] = useState('pending')
  const [withdrawalStatus, setWithdrawalStatus] = useState('pending')
  const [settingsForm, setSettingsForm] = useState<AffiliateSettings | null>(null)
  const [applyTierRatesToExisting, setApplyTierRatesToExisting] = useState(false)

  const affiliatesQuery = useAdminAffiliates(status === 'all' ? undefined : status)
  const overviewQuery = useAdminAffiliateOverview()
  const settingsQuery = useAdminAffiliateSettings()
  const commissionsQuery = useAdminAffiliateCommissions()
  const withdrawalsQuery = useAdminAffiliateWithdrawals(withdrawalStatus === 'all' ? undefined : withdrawalStatus)

  const reviewMutation = useReviewAffiliate()
  const tierMutation = useUpdateAffiliateTier()
  const settingsMutation = useUpdateAffiliateSettings()
  const withdrawalMutation = useProcessAffiliateWithdrawal()
  const suspendMutation = useSuspendAffiliate()

  useEffect(() => {
    if (settingsQuery.data?.settings && !settingsForm) {
      setSettingsForm(settingsQuery.data.settings)
    }
  }, [settingsQuery.data?.settings, settingsForm])

  const overview = overviewQuery.data
  const affiliates = affiliatesQuery.data?.items || []
  const commissions = commissionsQuery.data?.items || []
  const withdrawals = withdrawalsQuery.data?.items || []

  const saveDisabled = useMemo(() => {
    if (!settingsForm) return true
    return !settingsForm.allowBankTransfer && !settingsForm.allowPlatformCredits
  }, [settingsForm])

  const updateNumber = (path: 'cookieWindowDays' | 'minWithdrawalAmount' | 'commissionLockDays' | 'annualTaxThreshold', value: string) => {
    setSettingsForm((current) => (current ? { ...current, [path]: Number(value) || 0 } : current))
  }

  const updateTierRate = (tier: 'standard' | 'gold' | 'platinum', value: string) => {
    setSettingsForm((current) =>
      current
        ? {
            ...current,
            tierRates: { ...current.tierRates, [tier]: Number(value) || 0 },
          }
        : current,
    )
  }

  const review = (id: string, decision: 'approved' | 'rejected') => {
    const rejectionReason = decision === 'rejected' ? window.prompt('請輸入拒絕原因') || '' : undefined
    if (decision === 'rejected' && !rejectionReason) return
    reviewMutation.mutate(
      { id, payload: { decision, rejectionReason } },
      {
        onSuccess: () => toast.success(decision === 'approved' ? '已通過申請' : '已拒絕申請'),
        onError: (error: any) => toast.error(error?.response?.data?.message || '審核失敗'),
      },
    )
  }

  const saveSettings = () => {
    if (!settingsForm) return
    const payload = {
      applicationEnabled: settingsForm.applicationEnabled,
      autoApproveApplications: settingsForm.autoApproveApplications,
      tierRates: settingsForm.tierRates,
      cookieWindowDays: settingsForm.cookieWindowDays,
      minWithdrawalAmount: settingsForm.minWithdrawalAmount,
      commissionLockDays: settingsForm.commissionLockDays,
      allowBankTransfer: settingsForm.allowBankTransfer,
      allowPlatformCredits: settingsForm.allowPlatformCredits,
      annualTaxThreshold: settingsForm.annualTaxThreshold,
      programTerms: settingsForm.programTerms,
      landingPageIntro: settingsForm.landingPageIntro,
      applyTierRatesToExisting,
    }
    settingsMutation.mutate(
      payload,
      {
        onSuccess: () => toast.success('聯盟行銷設定已更新'),
        onError: (error: any) => toast.error(error?.response?.data?.message || '儲存失敗'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <HandCoins className="h-7 w-7 text-blue-300" />
            <h1 className="text-3xl font-bold text-white">聯盟行銷管理</h1>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            統一管理分潤制度、會員審核、佣金紀錄與提領處理。
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="聯盟會員" value={overview?.counts?.totalAffiliates ?? '-'} hint={`${overview?.counts?.pendingAffiliates ?? 0} 位待審核`} />
        <StatTile label="點擊 / 註冊" value={`${overview?.funnel?.clicks ?? 0} / ${overview?.funnel?.signups ?? 0}`} hint={`註冊率 ${pct(overview?.funnel?.signupRate)}`} />
        <StatTile label="成交轉換" value={overview?.funnel?.conversions ?? '-'} hint={`成交率 ${pct(overview?.funnel?.conversionRate)}`} />
        <StatTile label="待處理佣金" value={money(overview?.money?.pendingCommission)} hint={`待提領 ${money(overview?.money?.pendingWithdrawalAmount)}`} />
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="bg-slate-950">
          <TabsTrigger value="settings">全局設定</TabsTrigger>
          <TabsTrigger value="members">會員管理</TabsTrigger>
          <TabsTrigger value="commissions">佣金紀錄</TabsTrigger>
          <TabsTrigger value="withdrawals">提領處理</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="border-white/10 bg-slate-900 text-white">
            <CardHeader>
              <CardTitle>全站聯盟制度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!settingsForm ? (
                <p className="text-sm text-slate-400">載入設定中...</p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <BoolRow
                      label="開放聯盟申請"
                      description="關閉後，用戶不能送出新的聯盟申請，既有會員仍可追蹤與提領。"
                      checked={settingsForm.applicationEnabled}
                      onChange={(value) => setSettingsForm({ ...settingsForm, applicationEnabled: value })}
                    />
                    <BoolRow
                      label="申請自動通過"
                      description="開啟後，新申請會直接成為可用聯盟會員；關閉則需人工審核。"
                      checked={settingsForm.autoApproveApplications}
                      onChange={(value) => setSettingsForm({ ...settingsForm, autoApproveApplications: value })}
                    />
                    <BoolRow
                      label="銀行轉帳提領"
                      description="允許會員用銀行帳戶申請現金提領。"
                      checked={settingsForm.allowBankTransfer}
                      onChange={(value) => setSettingsForm({ ...settingsForm, allowBankTransfer: value })}
                    />
                    <BoolRow
                      label="平台點數提領"
                      description="允許會員把佣金轉成平台點數。"
                      checked={settingsForm.allowPlatformCredits}
                      onChange={(value) => setSettingsForm({ ...settingsForm, allowPlatformCredits: value })}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>標準級距佣金 %</Label>
                      <Input type="number" value={settingsForm.tierRates.standard} onChange={(event) => updateTierRate('standard', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>金牌級距佣金 %</Label>
                      <Input type="number" value={settingsForm.tierRates.gold} onChange={(event) => updateTierRate('gold', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>白金級距佣金 %</Label>
                      <Input type="number" value={settingsForm.tierRates.platinum} onChange={(event) => updateTierRate('platinum', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cookie 歸因天數</Label>
                      <Input type="number" value={settingsForm.cookieWindowDays} onChange={(event) => updateNumber('cookieWindowDays', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>最低提領金額</Label>
                      <Input type="number" value={settingsForm.minWithdrawalAmount} onChange={(event) => updateNumber('minWithdrawalAmount', event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>佣金鎖定天數</Label>
                      <Input type="number" value={settingsForm.commissionLockDays} onChange={(event) => updateNumber('commissionLockDays', event.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label>年度稅務提醒門檻</Label>
                      <Input type="number" value={settingsForm.annualTaxThreshold} onChange={(event) => updateNumber('annualTaxThreshold', event.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label>聯盟介紹文案</Label>
                      <Textarea value={settingsForm.landingPageIntro} onChange={(event) => setSettingsForm({ ...settingsForm, landingPageIntro: event.target.value })} rows={4} />
                    </div>
                    <div className="space-y-2">
                      <Label>聯盟條款</Label>
                      <Textarea value={settingsForm.programTerms} onChange={(event) => setSettingsForm({ ...settingsForm, programTerms: event.target.value })} rows={4} />
                    </div>
                  </div>

                  <BoolRow
                    label="同步套用級距比例到既有會員"
                    description="儲存時把標準、金牌、白金的新比例更新到所有同級距會員。"
                    checked={applyTierRatesToExisting}
                    onChange={setApplyTierRatesToExisting}
                  />

                  <div className="flex justify-end">
                    <Button onClick={saveSettings} disabled={saveDisabled || settingsMutation.isPending}>
                      <Save className="mr-2 h-4 w-4" />
                      儲存全局設定
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card className="border-white/10 bg-slate-900 text-white">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>聯盟會員</CardTitle>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">待審核</SelectItem>
                    <SelectItem value="approved">已通過</SelectItem>
                    <SelectItem value="rejected">已拒絕</SelectItem>
                    <SelectItem value="suspended">已停權</SelectItem>
                    <SelectItem value="all">全部</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {affiliatesQuery.isLoading && <p className="text-sm text-slate-400">載入中...</p>}
              {affiliates.map((item: any) => (
                <div key={item.id} className="grid gap-3 rounded-lg border border-white/10 bg-slate-950 p-4 xl:grid-cols-[1.4fr_0.8fr_0.9fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.realName}</p>
                      <Badge variant="outline">{statusLabel[item.status] || item.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{item.user?.email} · {item.affiliateCode}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.websiteUrl || item.promotionChannel || '尚未提供推廣來源'}</p>
                  </div>
                  <div className="text-sm text-slate-300">
                    <p>級距：{item.tier} / {item.commissionRate}%</p>
                    <p>提領：{item.payoutMethod === 'platform_credits' ? '平台點數' : '銀行轉帳'}</p>
                  </div>
                  <div className="text-sm text-slate-300">
                    <p>點擊 {item.totalClicks} · 註冊 {item.totalSignups}</p>
                    <p>累計 {money(item.totalCommissionEarned)} · 待付 {money(item.pendingCommission)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => review(item.id, 'approved')}>
                          <Check className="mr-1 h-4 w-4" />
                          通過
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => review(item.id, 'rejected')}>
                          <X className="mr-1 h-4 w-4" />
                          拒絕
                        </Button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <>
                        <Select
                          value={item.tier}
                          onValueChange={(tier) => {
                            tierMutation.mutate(
                              { id: item.id, tier: tier as 'standard' | 'gold' | 'platinum' },
                              { onSuccess: () => toast.success('級距已更新') },
                            )
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">標準</SelectItem>
                            <SelectItem value="gold">金牌</SelectItem>
                            <SelectItem value="platinum">白金</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate(item.id, { onSuccess: () => toast.success('已停權') })}>
                          <PauseCircle className="mr-1 h-4 w-4" />
                          停權
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!affiliatesQuery.isLoading && affiliates.length === 0 && (
                <p className="text-sm text-slate-400">目前沒有符合條件的聯盟會員。</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card className="border-white/10 bg-slate-900 text-white">
            <CardHeader>
              <CardTitle>佣金紀錄</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {commissionsQuery.isLoading && <p className="text-sm text-slate-400">載入中...</p>}
              {commissions.map((item: any) => (
                <div key={item.id} className="grid gap-3 rounded-lg border border-white/10 bg-slate-950 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-semibold">{item.affiliate?.user?.email || item.affiliateUserId}</p>
                    <p className="mt-1 text-sm text-slate-400">推薦用戶：{item.referredUser?.email || item.referredUserId}</p>
                    <p className="mt-1 text-xs text-slate-500">付款 {money(item.paymentAmount)} · 比例 {item.commissionRate}% · 狀態 {statusLabel[item.status] || item.status}</p>
                  </div>
                  <p className="text-lg font-semibold">{money(item.commissionAmount)}</p>
                </div>
              ))}
              {!commissionsQuery.isLoading && commissions.length === 0 && (
                <p className="text-sm text-slate-400">目前沒有佣金紀錄。</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card className="border-white/10 bg-slate-900 text-white">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>提領處理</CardTitle>
                <Select value={withdrawalStatus} onValueChange={setWithdrawalStatus}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">待處理</SelectItem>
                    <SelectItem value="processing">處理中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                    <SelectItem value="rejected">已拒絕</SelectItem>
                    <SelectItem value="all">全部</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {withdrawalsQuery.isLoading && <p className="text-sm text-slate-400">載入中...</p>}
              {withdrawals.map((item: any) => (
                <div key={item.id} className="grid gap-3 rounded-lg border border-white/10 bg-slate-950 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-semibold">{item.affiliate?.user?.email || item.affiliateUserId}</p>
                    <p className="mt-1 text-sm text-slate-400">方式：{item.type === 'platform_credits' ? '平台點數' : '銀行轉帳'} · 狀態 {statusLabel[item.status] || item.status}</p>
                    <p className="mt-1 text-xs text-slate-500">建立時間：{new Date(item.createdAt).toLocaleString('zh-TW')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="mr-2 text-lg font-semibold">{money(item.amount)}</p>
                    {['pending', 'processing'].includes(item.status) && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => withdrawalMutation.mutate({ id: item.id, payload: { decision: 'completed' } }, { onSuccess: () => toast.success('提領已完成') })}
                        >
                          完成付款
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const rejectionReason = window.prompt('請輸入拒絕原因') || ''
                            if (!rejectionReason) return
                            withdrawalMutation.mutate({ id: item.id, payload: { decision: 'rejected', rejectionReason } }, { onSuccess: () => toast.success('提領已拒絕') })
                          }}
                        >
                          拒絕
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!withdrawalsQuery.isLoading && withdrawals.length === 0 && (
                <p className="text-sm text-slate-400">目前沒有符合條件的提領申請。</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
