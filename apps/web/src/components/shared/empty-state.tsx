import React from 'react'
import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** CTA buttons / links (ReactNode for flexibility) */
  action?: React.ReactNode
  /** Render without the surrounding dashed Card (for use inside an existing card) */
  bare?: boolean
  className?: string
}

/**
 * Unified empty-state block. Replaces the per-page hand-rolled empty cards
 * so icon sizes, spacing and copy treatment stay consistent everywhere.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bare,
  className,
}: EmptyStateProps) {
  const body = (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gray-400">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-base font-semibold text-white">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-gray-400">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  )

  if (bare) return <div className={className}>{body}</div>

  return <Card className={cn('border-dashed', className)}>{body}</Card>
}
