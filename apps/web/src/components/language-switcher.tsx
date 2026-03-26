'use client';

import { useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';

export function LanguageSwitcher() {
  const router = useRouter();

  const handleChange = (locale: Locale) => {
    document.cookie = `locale=${locale};path=/;max-age=${365 * 24 * 60 * 60}`;
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1">
      {locales.map((locale) => (
        <button
          key={locale}
          onClick={() => handleChange(locale)}
          className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
