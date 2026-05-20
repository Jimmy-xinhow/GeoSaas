'use client'

import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, CreditCard, Loader2 } from 'lucide-react'
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

const pathTitles: Record<string, string> = {
  '/dashboard': '總覽',
  '/sites': '我的網站',
  '/sites/new': '新增網站',
  '/content': '內容資產',
  '/content/new': 'AI 內容生成',
  '/monitor': 'AI 引用監控',
  '/publish': '發布設定',
  '/settings': '設定',
  '/settings/billing/result': '付款結果',
  '/support': '客服支援',
}

function getPageTitle(pathname: string): string {
  if (pathTitles[pathname]) return pathTitles[pathname]
  if (pathname.startsWith('/sites/') && pathname.endsWith('/fix')) return 'AI 修復建議'
  if (pathname.startsWith('/sites/') && pathname.endsWith('/knowledge')) return '知識庫 Q&A'
  if (pathname.startsWith('/sites/') && pathname.endsWith('/llms-txt')) return 'llms.txt'
  if (pathname.startsWith('/sites/')) return '網站詳情'
  return 'Geovault'
}

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
  const pathname = usePathname()
  const router = useRouter()
  const title = getPageTitle(pathname)
  const user = useAuthStore((s) => s.user)
  const logoutMutation = useLogout()
  const { data: notifications = [], isLoading } = useNotifications(Boolean(user))
  const markRead = useMarkNotificationRead()

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  )
  const avatarChar = user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || '?'

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
    <header className="h-16 border-b border-white/5 bg-gray-900 flex items-center justify-between px-6 shrink-0">
      <h2 className="text-lg font-semibold text-white">{title}</h2>

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
