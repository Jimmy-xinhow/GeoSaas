'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  Eye,
  FileText,
  Globe,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  Settings,
  Share2,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout } from '@/hooks/use-auth'
import { useMarkNotificationRead, useNotifications, type NotificationItem } from '@/hooks/use-notifications'
import useAuthStore from '@/stores/auth-store'
import { GeovaultLogoCompactDark } from '@/components/logo'
import { cn } from '@/lib/utils'

const mobileCoreNavigation = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/sites', label: '我的網站', icon: Globe },
  { href: '/published-content', label: '平台文章與品質', icon: FileText },
  { href: '/monitor/reports', label: 'AI 引用成效', icon: ClipboardCheck },
]

const mobileAdvancedNavigation = [
  { href: '/content', label: '內容資產', icon: BookOpen },
  { href: '/monitor', label: 'AI 問題監測', icon: Eye },
  { href: '/publish', label: '多平台發佈', icon: Share2 },
  { href: '/brand-spread', label: '品牌擴散', icon: Sparkles },
  { href: '/directory', label: '公開品牌目錄', icon: Trophy },
  { href: '/support', label: '客服中心', icon: MessageSquare },
]

function formatNotificationTime(createdAt: string) {
  const time = new Date(createdAt).getTime()
  const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  if (diffMinutes < 1) return '剛剛'
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小時前`
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(time)
}

function routeForNotification(item: NotificationItem) {
  if (item.type.includes('subscription') || item.type.includes('credit') || item.type.includes('billing')) {
    return '/settings#credits'
  }
  if (item.type.includes('support')) return '/support'
  if (item.type.includes('scan') || item.type.includes('badge')) return '/sites'
  return '/dashboard'
}

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null)
  const user = useAuthStore((s) => s.user)
  const logoutMutation = useLogout()
  const { data: notifications = [], isLoading } = useNotifications(Boolean(user))
  const markRead = useMarkNotificationRead()

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  )
  const avatarChar = user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || '?'

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobileMenuCloseRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMobileMenuOpen(false)
      requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus())
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileMenuOpen])

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus())
  }

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.read) markRead.mutate(item.id)
    router.push(routeForNotification(item))
  }

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        router.push('/login')
      },
    })
  }

  return (
    <header className="h-16 border-b border-white/5 bg-gray-900 flex items-center justify-between px-4 sm:px-6 shrink-0 md:justify-end">
      <div className="flex items-center gap-3 md:hidden">
        <Button
          ref={mobileMenuTriggerRef}
          variant="ghost"
          size="icon"
          className="text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="開啟主選單"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" aria-label="回到工作台">
          <GeovaultLogoCompactDark className="h-6 w-auto" />
        </Link>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="主選單">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeMobileMenu}
            aria-label="關閉主選單"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <GeovaultLogoCompactDark className="h-7 w-auto" />
              <Button
                ref={mobileMenuCloseRef}
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={closeMobileMenu}
                aria-label="關閉主選單"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="行動版主選單">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">GEO 核心流程</p>
              <div className="space-y-1">
                {mobileCoreNavigation.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400',
                        active ? 'bg-blue-500/15 text-blue-100' : 'text-slate-300 hover:bg-white/8 hover:text-white',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              <details className="mt-4 border-t border-white/10 pt-3">
                <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-white/5 hover:text-slate-300">
                  進階工具
                </summary>
                <div className="mt-1 space-y-1">
                  {mobileAdvancedNavigation.map((item) => {
                    const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400',
                          active ? 'bg-blue-500/15 text-blue-100' : 'text-slate-400 hover:bg-white/8 hover:text-white',
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </details>
            </nav>
            <div className="border-t border-white/10 p-3">
              <Link
                href="/settings"
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <Settings className="h-5 w-5" />
                帳號與方案設定
              </Link>
            </div>
          </aside>
        </div>
      )}

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-gray-400 hover:text-white hover:bg-white/10"
              aria-label={`通知${unreadCount > 0 ? `，${unreadCount} 則未讀` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-white/10 bg-gray-950 p-0 text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">通知中心</p>
                <p className="text-xs text-gray-400">{unreadCount > 0 ? `${unreadCount} 則未讀` : '目前沒有未讀通知'}</p>
              </div>
              <CreditCard className="h-4 w-4 text-blue-300" />
            </div>
            <div className="max-h-96 overflow-y-auto p-1">
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  載入通知中
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-400">尚無通知。</div>
              ) : (
                notifications.slice(0, 8).map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="block cursor-pointer rounded-md px-3 py-3 hover:bg-white/10"
                    onClick={() => handleNotificationClick(item)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-gray-600' : 'bg-red-500'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{item.message}</p>
                        <p className="mt-2 text-[11px] text-gray-500">{formatNotificationTime(item.createdAt)}</p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium hover:bg-blue-700 transition-colors">
              {avatarChar}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              個人資料
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings#credits')}>
              方案與點數
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={handleLogout}>
              登出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
