'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { locales, localeNames, type Locale } from '@/i18n/config';

export function LanguageSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (locale: Locale) => {
    document.cookie = `locale=${locale};path=/;max-age=${365 * 24 * 60 * 60}`;
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">語言</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-gray-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[120px] z-50">
          {locales.map((locale) => (
            <button
              key={locale}
              onClick={() => handleChange(locale)}
              className="block w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {localeNames[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
