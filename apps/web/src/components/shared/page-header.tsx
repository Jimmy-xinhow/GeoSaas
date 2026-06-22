import React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Optional icon shown left of the title */
  icon?: React.ComponentType<{ className?: string }>
  /** Right-aligned actions (buttons, selects, etc.) */
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * Unified dashboard page header. This is the single source of truth for a
 * page title — the top app bar no longer renders a duplicate title.
 * Keep styling here; do not hand-roll <h1> banners in individual pages.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white">
            {title}
          </h1>
          {description && (
            <p className="text-sm leading-relaxed text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
      {(actions || children) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          {children}
        </div>
      )}
    </div>
  )
}
