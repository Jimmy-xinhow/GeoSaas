'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Globe,
  FileText,
  Eye,
  Share2,
  Settings,
  Trophy,
  Shield,
  ClipboardCheck,
  ChevronDown,
  Wrench,
  BookOpen,
  BarChart3,
  Zap,
  MessageSquare,
  HandCoins,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import useAuthStore from '@/stores/auth-store'
import { GeovaultLogoCompactDark } from '@/components/logo'

interface NavGroup {
  label: string
  items: { href: string; icon: any; label: string }[]
  defaultOpen?: boolean
}

const navGroups: NavGroup[] = [
  {
    label: '主要',
    defaultOpen: true,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: '總覽' },
      { href: '/sites', icon: Globe, label: '我的網站' },
      { href: '/support', icon: MessageSquare, label: '客服中心' },
    ],
  },
  {
    label: 'AI 工具',
    defaultOpen: true,
    items: [
      { href: '/content', icon: FileText, label: '內容引擎' },
      { href: '/published-content', icon: FileText, label: 'Geovault 為您發布' },
      { href: '/monitor', icon: Eye, label: 'AI 監控' },
      { href: '/monitor/reports', icon: ClipboardCheck, label: '驗收報告' },
    ],
  },
  {
    label: '推廣',
    defaultOpen: false,
    items: [
      { href: '/brand-spread', icon: Zap, label: '品牌擴散' },
      { href: '/affiliate', icon: HandCoins, label: '聯盟行銷' },
      { href: '/publish', icon: Share2, label: '多平台發佈' },
      { href: '/directory', icon: Trophy, label: '公開目錄' },
      { href: '/dashboard/submit-case', icon: Trophy, label: '提交成功案例' },
    ],
  },
]

function NavSection({ group }: { group: NavGroup }) {
  const pathname = usePathname()
  const hasActive = group.items.some(
    (item) => pathname === item.href || pathname?.startsWith(item.href + '/'),
  )
  const [open, setOpen] = useState(group.defaultOpen || hasActive)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
      >
        {group.label}
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            open ? '' : '-rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="space-y-0.5 mb-2">
          {group.items.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)

  return (
    <aside className="hidden w-60 shrink-0 self-stretch h-dvh min-h-screen overflow-hidden bg-gray-900 text-white md:flex flex-col sticky top-0 border-r border-white/5">
      {/* Logo */}
      <div className="p-4 pb-2">
        <Link href="/dashboard" prefetch={false}>
          <GeovaultLogoCompactDark className="h-7 w-auto" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 px-3 py-2 space-y-1 overflow-y-auto bg-gray-900">
        {navGroups.map((group) => (
          <NavSection key={group.label} group={group} />
        ))}

        {/* Settings — always visible */}
        <div className="pt-2 border-t border-white/5 mt-2">
          <Link
            href="/settings"
            prefetch={false}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              pathname === '/settings'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
            )}
          >
            <Settings className="h-4.5 w-4.5 shrink-0" />
            設定
          </Link>
        </div>

        {/* Playbook — STAFF + ADMIN + SUPER_ADMIN */}
        {(user?.role === 'STAFF' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
          <div>
            <Link
              href="/playbook"
              prefetch={false}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                pathname === '/playbook'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
              )}
            >
              <BookOpen className="h-4.5 w-4.5 shrink-0" />
              操作手冊
            </Link>
          </div>
        )}

        {user?.role === 'STAFF' && (
          <div className="pt-2">
            <Link
              href="/admin/support"
              prefetch={false}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors border border-red-800/30',
                pathname?.startsWith('/admin/support')
                  ? 'bg-red-900/30 text-red-400'
                  : 'text-red-400/70 hover:text-red-400 hover:bg-red-900/20',
              )}
            >
              <Shield className="h-4.5 w-4.5 shrink-0" />
              客服處理台
            </Link>
          </div>
        )}

        {/* Admin */}
        {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
          <div className="pt-2">
            <Link
              href="/admin"
              prefetch={false}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors border border-red-800/30',
                pathname?.startsWith('/admin')
                  ? 'bg-red-900/30 text-red-400'
                  : 'text-red-400/70 hover:text-red-400 hover:bg-red-900/20',
              )}
            >
              <Shield className="h-4.5 w-4.5 shrink-0" />
              管理後台
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom — Plan info */}
      <div className="mt-auto bg-gray-900 px-3 pb-3 pt-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs text-gray-400 mb-1.5">
            {user?.plan === 'PRO' ? 'Pro 方案' : user?.plan === 'STARTER' ? 'Starter 方案' : 'Free 方案'}
          </p>
          {user?.plan === 'FREE' && (
            <Link href="/settings" prefetch={false}>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                升級方案
              </Button>
            </Link>
          )}
        </div>
      </div>
    </aside>
  )
}
