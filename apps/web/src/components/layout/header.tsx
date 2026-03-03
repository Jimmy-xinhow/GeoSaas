'use client'

import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const pathTitles: Record<string, string> = {
  '/dashboard': '總覽',
  '/sites': '我的網站',
  '/sites/new': '新增網站',
  '/content': '內容引擎',
  '/content/new': 'AI 內容生成',
  '/monitor': 'AI 引用監控',
  '/publish': '多平台佈局',
  '/settings': '設定',
}

function getPageTitle(pathname: string): string {
  if (pathTitles[pathname]) return pathTitles[pathname]
  if (pathname.startsWith('/sites/') && pathname.endsWith('/fix')) return '修復工具'
  if (pathname.startsWith('/sites/')) return '網站詳情'
  return 'GEO SaaS'
}

export default function Header() {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0">
      {/* Left: Page title */}
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

      {/* Right: Notifications + Avatar */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium hover:bg-blue-700 transition-colors">
              王
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>個人資料</DropdownMenuItem>
            <DropdownMenuItem>帳號設定</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">登出</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
