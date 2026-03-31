'use client'

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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import useAuthStore from '@/stores/auth-store'
import { GeovaultLogoCompactDark } from '@/components/logo'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: '總覽' },
  { href: '/sites', icon: Globe, label: '我的網站' },
  { href: '/content', icon: FileText, label: '內容引擎' },
  { href: '/monitor', icon: Eye, label: 'AI 監控' },
  { href: '/monitor/reports', icon: ClipboardCheck, label: '客戶驗收報告' },
  { href: '/publish', icon: Share2, label: '多平台佈局' },
  { href: '/directory', icon: Trophy, label: '公開目錄' },
  { href: '/settings', icon: Settings, label: '設定' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)

  return (
    <aside className="w-64 h-screen bg-gray-900 text-white flex flex-col sticky top-0">
      {/* Logo */}
      <div className="p-4">
        <Link href="/dashboard">
          <GeovaultLogoCompactDark className="h-8 w-auto" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
        {user?.role === 'ADMIN' && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors mt-4 border border-red-800/30',
              pathname?.startsWith('/admin')
                ? 'bg-red-900/30 text-red-400'
                : 'text-red-400/70 hover:text-red-400 hover:bg-red-900/20'
            )}
          >
            <Shield className="h-5 w-5 shrink-0" />
            管理後台
          </Link>
        )}
      </nav>

      {/* Bottom — Plan info */}
      <div className="p-4 mx-4 mb-4 bg-gray-800 rounded-lg">
        <p className="text-sm text-gray-400 mb-2">
          {user?.plan === 'PRO' ? 'Pro 方案' : user?.plan === 'STARTER' ? 'Starter 方案' : 'Free 方案'}
        </p>
        {user?.plan === 'FREE' && (
          <Link href="/settings">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">
              升級方案
            </Button>
          </Link>
        )}
      </div>
    </aside>
  )
}
