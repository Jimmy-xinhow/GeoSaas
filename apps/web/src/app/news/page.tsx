import type { Metadata } from 'next';
import Link from 'next/link';
import NewsClient from './news-client';
import PublicFooter from '@/components/layout/public-footer';
import PublicNavbar from '@/components/layout/public-navbar';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getNewsSnapshot() {
  try {
    const res = await fetch(`${API_URL}/api/news?limit=8`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

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

export default async function NewsPage() {
  const news = await getNewsSnapshot();
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
  const itemListJsonLd = news.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Geovault AI News',
        itemListElement: news.map((item: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/news#${item.slug}`,
          name: item.title,
        })),
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionsJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}

      <PublicNavbar />

      <NewsClient />
      {news.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <h2 className="text-lg font-bold text-white mb-4">最新 AI News</h2>
          <div className="space-y-3">
            {news.map((item: any) => (
              <article key={item.slug} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-400 line-clamp-2">{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <PublicFooter />
    </div>
  );
}
