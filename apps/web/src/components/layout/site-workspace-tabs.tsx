'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Wrench,
  FileText,
  Eye,
  BookOpen,
  Bot,
  Globe2,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkspaceTab {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** path suffix appended to /sites/[id] */
  sub: string
  /** path suffixes that should mark this tab active */
  match: string[]
}

const TABS: WorkspaceTab[] = [
  { key: 'overview', label: '總覽與下一步', icon: LayoutDashboard, sub: '', match: [] },
  { key: 'fix', label: '技術修復', icon: Wrench, sub: '/guided-fix', match: ['/guided-fix', '/fix', '/cms-fix'] },
  { key: 'knowledge', label: '品牌知識', icon: BookOpen, sub: '/knowledge', match: ['/knowledge'] },
  { key: 'official-content', label: '官網文章', icon: Globe2, sub: '/official-content', match: ['/official-content'] },
  { key: 'monitor', label: 'AI 成效', icon: Eye, sub: '/monitor', match: ['/monitor'] },
]

const ADVANCED_TABS: WorkspaceTab[] = [
  { key: 'content', label: '平台內容', icon: FileText, sub: '/content', match: ['/content'] },
  { key: 'crawler', label: '爬蟲追蹤', icon: Bot, sub: '/crawler', match: ['/crawler'] },
  { key: 'llms', label: 'llms.txt 管理', icon: FileText, sub: '/llms-txt', match: ['/llms-txt'] },
]

/**
 * Persistent per-site workspace navigation. Renders a breadcrumb + a tab bar
 * so every page under /sites/[siteId]/* feels like ONE place. This is the
 * backbone of the site-centric experience — drop it at the top of every
 * per-site page and pass the current site's name.
 */
export function SiteWorkspaceTabs({
  siteId,
  siteName,
}: {
  siteId: string
  siteName?: string
}) {
  const pathname = usePathname() || ''
  const base = `/sites/${siteId}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''

  const activeKey =
    TABS.find((t) => t.key !== 'overview' && t.match.some((m) => rest.startsWith(m)))
      ?.key
      ?? ADVANCED_TABS.find((t) => t.match.some((m) => rest.startsWith(m)))?.key
      ?? 'overview'
  const advancedActive = ADVANCED_TABS.some((tab) => tab.key === activeKey)

  return (
    <div className="mb-6 border-b border-white/10">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/sites" className="transition-colors hover:text-white">
          我的網站
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
        <span className="truncate font-semibold text-white">
          {siteName || '網站'}
        </span>
      </div>

      {/* tab bar */}
      <div className="-mb-px mt-3 flex min-w-0 items-end gap-1">
      <nav className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto" aria-label={`${siteName || '網站'}工作區`}>
        {TABS.map((t) => {
          const href = base + t.sub
          const active = t.key === activeKey
          const Icon = t.icon
          return (
            <Link
              key={t.key}
              href={href}
              prefetch={false}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400',
                active
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-gray-400 hover:border-white/20 hover:text-white',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          )
        })}
      </nav>
        <details className="group relative shrink-0">
          <summary
            className={cn(
              'inline-flex cursor-pointer list-none items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400',
              advancedActive
                ? 'border-blue-400 text-white'
                : 'border-transparent text-gray-400 hover:border-white/20 hover:text-white',
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
            更多工具
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-1 shadow-2xl">
            {ADVANCED_TABS.map((tab) => {
              const Icon = tab.icon
              const active = tab.key === activeKey
              return (
                <Link
                  key={tab.key}
                  href={base + tab.sub}
                  prefetch={false}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400',
                    active ? 'bg-blue-500/15 text-blue-100' : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </details>
      </div>
    </div>
  )
}
