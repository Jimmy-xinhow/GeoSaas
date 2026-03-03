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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: '總覽' },
  { href: '/sites', icon: Globe, label: '我的網站' },
  { href: '/content', icon: FileText, label: '內容引擎' },
  { href: '/monitor', icon: Eye, label: 'AI 監控' },
  { href: '/publish', icon: Share2, label: '多平台佈局' },
  { href: '/settings', icon: Settings, label: '設定' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 h-screen bg-gray-900 text-white flex flex-col sticky top-0">
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-xl font-bold text-white">GEO SaaS</h1>
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
      </nav>

      {/* Bottom usage section */}
      <div className="p-4 mx-4 mb-4 bg-gray-800 rounded-lg">
        <p className="text-sm text-gray-400 mb-2">已用 3/5 次掃描</p>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: '60%' }}
          />
        </div>
        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">
          升級 Pro
        </Button>
      </div>
    </aside>
  )
}
