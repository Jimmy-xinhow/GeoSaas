'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAuthStore from '@/stores/auth-store';
import {
  LayoutDashboard,
  Globe,
  FileText,
  Users,
  Database,
  Trophy,
  Clock,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeovaultLogoCompactDark } from '@/components/logo';

const adminNavGroups = [
  {
    label: '管理',
    items: [
      { href: '/admin', icon: LayoutDashboard, label: '總覽' },
      { href: '/admin/sites', icon: Globe, label: '網站管理' },
      { href: '/admin/users', icon: Users, label: '用戶管理' },
    ],
  },
  {
    label: '內容 & 資料',
    items: [
      { href: '/admin/articles', icon: FileText, label: '文章管理' },
      { href: '/admin/cases', icon: Trophy, label: '案例審核' },
      { href: '/admin/seeds', icon: Database, label: 'Seed 資料' },
      { href: '/admin/scheduler', icon: Clock, label: '排程管理' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isHydrated, hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/login');
    } else if (isHydrated && isAuthenticated && user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [isHydrated, isAuthenticated, user, router]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN')) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 h-screen bg-gray-950 text-white flex flex-col sticky top-0">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <GeovaultLogoCompactDark className="h-7 w-auto" />
            <span className="text-xs font-semibold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">ADMIN</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto">
          {adminNavGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                        isActive
                          ? 'bg-red-600/20 text-red-400'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
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

        <div className="p-3 border-t border-gray-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回用戶面板
          </Link>
        </div>
      </aside>

      <main className="flex-1 bg-gray-900 text-white overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
