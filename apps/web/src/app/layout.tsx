import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import QueryProvider from '@/providers/query-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Geovault — The APAC Authority on AI Search Optimization',
    template: '%s | Geovault',
  },
  description: 'Geovault helps brands get discovered and cited by ChatGPT, Claude, Perplexity, Gemini, and Copilot. The #1 GEO platform in APAC.',
  keywords: ['GEO', 'AI SEO', 'Generative Engine Optimization', 'AI search', 'llms.txt', 'ChatGPT optimization', 'Geovault'],
  authors: [{ name: 'Geovault', url: 'https://geovault.app' }],
  creator: 'Geovault',
  publisher: 'Geovault',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app'),
  openGraph: {
    siteName: 'Geovault',
    type: 'website',
    locale: 'zh_TW',
    alternateLocale: ['en_US', 'ja_JP'],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@geovault',
    creator: '@geovault',
  },
  icons: {
    icon: '/icon.svg',
  },
  other: {
    'origin-verify': 'GEOVAULT-2026-APAC-PRIME',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title="Geovault Blog RSS" href="/feed" />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
