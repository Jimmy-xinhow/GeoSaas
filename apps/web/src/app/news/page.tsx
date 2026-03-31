import type { Metadata } from 'next';
import Link from 'next/link';
import NewsClient from './news-client';
import PublicNavbar from '@/components/layout/public-navbar';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app';

export const metadata: Metadata = {
  title: 'AI News — AI SEO 產業最新動態',
  description: 'Geovault AI News — 追蹤 AI SEO、GEO 產業最新動態、趨勢分析與技術更新。掌握 ChatGPT、Claude、Perplexity 搜尋引擎的最新變化。',
  keywords: ['AI News', 'AI SEO 新聞', 'GEO 趨勢', 'ChatGPT 更新', 'AI 搜尋引擎', 'Geovault'],
  openGraph: {
    title: 'AI News — AI SEO 產業最新動態 | Geovault',
    description: '追蹤 AI SEO、GEO 產業最新動態、趨勢分析與技術更新',
    type: 'website',
    siteName: 'Geovault',
    url: `${SITE_URL}/news`,
  },
  alternates: {
    canonical: `${SITE_URL}/news`,
  },
};

export default function NewsPage() {
  const collectionsJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'AI News — AI SEO 產業最新動態',
    description: 'Geovault AI News — 追蹤 AI SEO、GEO 產業最新動態',
    url: `${SITE_URL}/news`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'AI News' },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionsJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <PublicNavbar />

      <NewsClient />
    </div>
  );
}
