import React from 'react'
import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** small hint / delta line under the value */
  hint?: React.ReactNode
  /** accent for the icon chip */
  accent?: 'blue' | 'emerald' | 'amber' | 'sky' | 'red' | 'gray'
  className?: string
}

const accentChip: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-300',
  emerald: 'bg-emerald-500/10 text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-300',
  sky: 'bg-sky-500/10 text-sky-300',
  red: 'bg-red-500/10 text-red-300',
  gray: 'bg-white/[0.06] text-gray-300',
}

/** Unified KPI / statistic card. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = 'blue',
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-400">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">
            {value}
          </p>
          {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              accentChip[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </CardContent>
    </Card>
  )
}
