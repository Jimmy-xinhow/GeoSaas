'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/directory', label: '目錄' },
  { href: '/industry/auto_care', label: '汽車美容' },
  { href: '/industry/traditional_medicine', label: '整復推拿' },
  { href: '/blog', label: 'Blog' },
  { href: '/cases', label: '案例' },
];

export default function PublicNavbar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white/80 backdrop-blur-sm sticky top-0 z-50 border-b border-gray-100">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Geovault
        </Link>
        <div className="hidden md:flex items-center gap-6">
          {pathname === '/' && (
            <>
              <a
                href="#features"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                功能
              </a>
              <a
                href="#pricing"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                定價
              </a>
            </>
          )}
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-sm transition-colors',
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'text-blue-600 font-medium'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <Link href="/login">
          <Button variant="ghost" size="sm">
            登入
          </Button>
        </Link>
        <Link href="/register">
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            免費開始
          </Button>
        </Link>
      </div>
    </nav>
  );
}
