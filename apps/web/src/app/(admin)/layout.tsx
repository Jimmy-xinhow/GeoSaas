'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Database,
  FileText,
  Globe,
  HandCoins,
  LayoutDashboard,
  MessageSquare,
  Trophy,
  Users,
} from 'lucide-react';
import { GeovaultLogoCompactDark } from '@/components/logo';
import { cn } from '@/lib/utils';
import useAuthStore from '@/stores/auth-store';

const adminNavGroups = [
  {
    label: '管理',
    items: [
      { href: '/admin', icon: LayoutDashboard, label: '總覽' },
      { href: '/admin/sites', icon: Globe, label: '網站管理' },
      { href: '/admin/users', icon: Users, label: '用戶管理' },
      { href: '/admin/affiliates', icon: HandCoins, label: '聯盟行銷' },
    ],
  },
  {
    label: '內容與資料',
    items: [
      { href: '/admin/articles', icon: FileText, label: '文章管理' },
      { href: '/admin/cases', icon: Trophy, label: '成功案例' },
      { href: '/admin/seeds', icon: Database, label: 'Seed 資料' },
      { href: '/admin/scheduler', icon: Clock, label: '排程管理' },
    ],
  },
  {
    label: '支援',
    items: [{ href: '/admin/support', icon: MessageSquare, label: '客服管理' }],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isHydrated, hydrate } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isStaffSupport = user?.role === 'STAFF' && pathname?.startsWith('/admin/support');

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/login');
    } else if (isHydrated && isAuthenticated && !isAdmin && !isStaffSupport) {
      router.replace('/dashboard');
    }
  }, [isHydrated, isAuthenticated, isAdmin, isStaffSupport, router]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || (!isAdmin && !isStaffSupport)) return null;

  const visibleAdminNavGroups = isAdmin
    ? adminNavGroups
    : adminNavGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.href === '/admin/support'),
        }))
        .filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 flex-col bg-gray-950 text-white">
        <div className="border-b border-gray-800 p-5">
          <div className="flex items-center gap-2">
            <GeovaultLogoCompactDark className="h-7 w-auto" />
            <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-xs font-semibold text-red-400">ADMIN</span>
          </div>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {visibleAdminNavGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive ? 'bg-red-600/20 text-red-400' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回用戶後台
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-900 text-white">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
