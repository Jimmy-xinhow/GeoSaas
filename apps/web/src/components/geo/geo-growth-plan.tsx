'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { GeoGrowthPlan, GeoGrowthStage } from '@/hooks/use-sites'
import { cn } from '@/lib/utils'

interface GeoGrowthPlanPanelProps {
  plan?: GeoGrowthPlan
  isLoading?: boolean
  hasError?: boolean
  onRetry?: () => void
  onScan?: () => void
  isActionPending?: boolean
  className?: string
}

const stageTone: Record<GeoGrowthStage['status'], string> = {
  completed: 'border-emerald-400/25 bg-emerald-400/8 text-emerald-100',
  current: 'border-blue-300/50 bg-blue-500/14 text-white ring-1 ring-blue-300/20',
  upcoming: 'border-white/10 bg-slate-950/30 text-slate-400',
}

function StageIcon({ status, order }: { status: GeoGrowthStage['status']; order: number }) {
  if (status === 'completed') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
        <Check className="h-4 w-4" aria-hidden="true" />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-400/20 text-sm font-bold text-blue-100">
        {order}
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-slate-500">
      {order}
    </span>
  )
}

function StageCard({ stage }: { stage: GeoGrowthStage }) {
  const body = (
    <div
      className={cn(
        'h-full rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-blue-400',
        stageTone[stage.status],
      )}
      aria-current={stage.status === 'current' ? 'step' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <StageIcon status={stage.status} order={stage.order} />
        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
          {stage.status === 'completed' ? '已完成' : stage.status === 'current' ? '現在進行' : '稍後處理'}
        </span>
      </div>
      <p className="mt-3 text-sm font-bold">{stage.title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-75">{stage.description}</p>
    </div>
  )

  if (stage.status === 'upcoming') return body
  return (
    <Link href={stage.href} className="block h-full rounded-xl focus:outline-none">
      {body}
    </Link>
  )
}

function QualitySummary({ plan }: { plan: GeoGrowthPlan }) {
  const score = plan.quality.latestArticleScore
  const scoreReady = score !== null
  const scorePassed = scoreReady && score >= plan.quality.officialMinimumScore

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          <p className="text-sm font-bold text-white">交付品質閘門</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[11px] font-bold text-emerald-100">
          高品質模式
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-[11px] text-slate-500">品牌事實</p>
          <p className="mt-1 text-lg font-bold text-white">{plan.quality.factConfidence}</p>
          <p className="text-[10px] text-slate-500">門檻 {plan.quality.minimumFactConfidence}</p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-[11px] text-slate-500">文章品質</p>
          <p className={cn('mt-1 text-lg font-bold', scorePassed ? 'text-emerald-300' : 'text-white')}>
            {scoreReady ? score : '—'}
          </p>
          <p className="text-[10px] text-slate-500">門檻 {plan.quality.officialMinimumScore}</p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-[11px] text-slate-500">自動修正</p>
          <p className="mt-1 text-lg font-bold text-white">{plan.quality.autoRepairAttempts30d}</p>
          <p className="text-[10px] text-slate-500">近 30 天</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-400">
        內容未達門檻會先退回自動修正；仍不合格就停止交付並要求更換主題。
      </p>
    </div>
  )
}

export function GeoGrowthPlanPanel({
  plan,
  isLoading,
  hasError,
  onRetry,
  onScan,
  isActionPending,
  className,
}: GeoGrowthPlanPanelProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="space-y-4 p-5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (hasError) {
    return (
      <Card className={cn('border-amber-400/25', className)}>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-100">暫時無法計算 GEO 下一步</p>
            <p className="mt-1 text-sm text-slate-400">其他功能仍可使用；重新整理後系統會再次整合掃描、內容與驗收資料。</p>
          </div>
          {onRetry && (
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新整理
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!plan) return null

  const actionButton = plan.nextAction.action === 'scan' && onScan ? (
    <Button
      className="h-11 bg-blue-600 px-5 text-white hover:bg-blue-700"
      onClick={onScan}
      disabled={isActionPending}
    >
      {isActionPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {isActionPending ? '處理中...' : plan.nextAction.cta}
    </Button>
  ) : (
    <Link
      href={plan.nextAction.href}
      className="inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      {plan.nextAction.cta}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
    </Link>
  )

  return (
    <Card className={cn('overflow-hidden border-blue-400/20 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_34%),rgba(15,23,42,0.86)]', className)}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-100">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-bold">GEO 成長路線</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              系統依掃描、品牌事實、內容品質與 AI 驗收結果，自動決定唯一下一步。
            </p>
          </div>
          <div className="min-w-[170px]">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>整體進度</span>
              <span className="text-white">{plan.progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.progress}>
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300" style={{ width: `${plan.progress}%` }} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-xl border border-blue-300/25 bg-blue-500/10 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-200">現在只做這一件事</p>
            <h3 className="mt-2 text-xl font-bold text-white">{plan.nextAction.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{plan.nextAction.description}</p>
            <div className="mt-4">{actionButton}</div>
          </div>
          <QualitySummary plan={plan} />
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="GEO 優化流程">
          {plan.stages.map((stage) => (
            <li key={stage.key}>
              <StageCard stage={stage} />
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            已核准官網文章 {plan.quality.officialApprovedCount} 篇
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleDashed className="h-4 w-4 text-blue-300" aria-hidden="true" />
            待改善技術指標 {plan.signals.technicalIssues} 項
          </span>
          <span>AI 驗收問題 {plan.signals.querySetCount} 組</span>
        </div>
      </CardContent>
    </Card>
  )
}
