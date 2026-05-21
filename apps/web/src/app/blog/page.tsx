import type { Metadata } from 'next';
import PublicFooter from '@/components/layout/public-footer';
import PublicNavbar from '@/components/layout/public-navbar';
import BlogClient from './blog-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getServerArticles() {
  try {
    const res = await fetch(`${API_URL}/api/blog/articles?limit=12`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

export const metadata: Metadata = {
  title: 'Blog — AI SEO 優化知識與分析報告',
  description: 'Geovault Blog — AI SEO 優化知識、GEO 趨勢、品牌分析報告。超過 500 篇 AI 生成的深度分析，涵蓋台灣 12 個行業。',
  keywords: ['GEO Blog', 'AI SEO 文章', 'AI 能見度分析', '品牌 GEO 報告', 'Geovault'],
  openGraph: {
    title: 'Blog — AI SEO 優化知識與分析報告 | Geovault',
    description: '超過 500 篇 AI 生成的深度分析，涵蓋台灣 12 個行業',
    type: 'website',
    siteName: 'Geovault',
    url: `${SITE_URL}/blog`,
  },
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
};

export default async function BlogPage() {
  const serverArticles = await getServerArticles();
  const collectionsJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Geovault Blog — AI SEO 優化知識與分析報告',
    description: '超過 500 篇 AI 生成的品牌分析報告，涵蓋台灣 12 個行業的 GEO 優化數據',
    url: `${SITE_URL}/blog`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
    identifier: 'GEOVAULT-2026-APAC-PRIME',
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog' },
    ],
  };
  const itemListJsonLd = serverArticles.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Geovault 最新 AI SEO 文章',
        itemListElement: serverArticles.map((article: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/blog/${article.slug}`,
          name: article.title,
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

      <BlogClient />
      {serverArticles.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <h2 className="text-lg font-bold text-white mb-4">最新 AI SEO 文章</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {serverArticles.slice(0, 8).map((article: any) => (
              <a
                key={article.slug}
                href={`/blog/${article.slug}`}
                className="block rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors"
              >
                <h3 className="font-semibold text-white line-clamp-2">{article.title}</h3>
                <p className="mt-2 text-sm text-gray-400 line-clamp-2">{article.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}
      <PublicFooter />
    </div>
  );
}
