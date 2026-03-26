import { getRequestConfig } from 'next-intl/server';
import { defaultLocale } from './config';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async () => {
  // Check cookie first, then Accept-Language header, then default
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;

  let locale = localeCookie || defaultLocale;

  // Validate locale
  const validLocales = ['zh-TW', 'en', 'ja'];
  if (!validLocales.includes(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
