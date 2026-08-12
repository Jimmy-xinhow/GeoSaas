import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import QueryProvider from '@/providers/query-provider';
import GoogleAuthProvider from '@/providers/google-oauth-provider';
import AffiliateTracker from '@/components/affiliate/affiliate-tracker';
import AnalyticsConsent from '@/components/analytics/analytics-consent';
import { Suspense } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Geovault — AI Search Optimization and Citation Measurement',
    template: '%s | Geovault',
  },
  description: 'Geovault provides AI-readable website audits, brand knowledge tools, citation measurement, and evidence-based GEO reporting.',
  keywords: ['GEO', 'AI SEO', 'Generative Engine Optimization', 'AI search', 'llms.txt', 'ChatGPT optimization', 'Geovault'],
  authors: [{ name: 'Geovault', url: 'https://www.geovault.app' }],
  creator: 'Geovault',
  publisher: 'Geovault',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app'),
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
        {/* Syndication feeds — discoverable via HTML (not only Link header) */}
        <link rel="alternate" type="application/rss+xml" title="Geovault RSS" href="/feed" />
        <link rel="alternate" type="application/feed+json" title="Geovault JSON Feed" href="/feed.json" />

        {/* AI crawler discovery */}
        <link rel="ai-content" type="text/plain" href="/llms.txt" />
        <link rel="ai-content-full" type="text/plain" href="/llms-full.txt" />
        <link rel="ai-plugin" type="application/json" href="/.well-known/ai-plugin.json" />
        <link rel="ai-policy" type="text/plain" href="/.well-known/ai.txt" />

        {/* hreflang: only advertise locales that have real, indexable pages. */}
        <link rel="alternate" hrefLang="zh-TW" href="https://www.geovault.app" />
        <link rel="alternate" hrefLang="x-default" href="https://www.geovault.app" />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <GoogleAuthProvider>
              <AffiliateTracker />
              {children}
              <Suspense fallback={null}>
                <AnalyticsConsent />
              </Suspense>
            </GoogleAuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
