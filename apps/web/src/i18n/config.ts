export const locales = ['zh-TW', 'en', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh-TW';

export const localeNames: Record<Locale, string> = {
  'zh-TW': '中文',
  en: 'English',
  ja: '日本語',
};
