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
  { key: 'overview', label: '總覽', icon: LayoutDashboard, sub: '', match: [] },
  { key: 'fix', label: '修復', icon: Wrench, sub: '/guided-fix', match: ['/guided-fix', '/fix', '/cms-fix'] },
  { key: 'content', label: '內容', icon: FileText, sub: '/content', match: ['/content'] },
  { key: 'official-content', label: '官網專屬', icon: Globe2, sub: '/official-content', match: ['/official-content'] },
  { key: 'monitor', label: '監控', icon: Eye, sub: '/monitor', match: ['/monitor'] },
  { key: 'knowledge', label: '知識庫', icon: BookOpen, sub: '/knowledge', match: ['/knowledge'] },
  { key: 'crawler', label: '爬蟲追蹤', icon: Bot, sub: '/crawler', match: ['/crawler'] },
  { key: 'llms', label: 'llms.txt', icon: FileText, sub: '/llms-txt', match: ['/llms-txt'] },
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
      ?.key ?? 'overview'

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
      <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
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
                'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-gray-400 hover:border-white/20 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
