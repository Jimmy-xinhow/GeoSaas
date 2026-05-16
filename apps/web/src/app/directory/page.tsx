import { Metadata } from 'next';
import DirectoryClient from './directory-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getDirectorySnapshot() {
  try {
    const res = await fetch(`${API_URL}/api/directory?limit=12`, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

export const metadata: Metadata = {
  title: 'GEO 優化目錄 — AI SEO 品牌排行榜',
  description:
    '探索已通過 AI SEO 優化認證的品牌。查看 GEO 分數排行、行業分類、AI 爬蟲即時動態。收錄超過 700 個品牌的 AI 友善度資料。',
  keywords: ['GEO 目錄', 'AI SEO 排行', '品牌 AI 能見度', 'AI 搜尋優化', 'GEO 分數'],
  alternates: {
    canonical: `${SITE_URL}/directory`,
  },
  openGraph: {
    title: 'GEO 優化目錄 — AI SEO 品牌排行榜',
    description: '收錄超過 700 個品牌的 AI 友善度資料，按行業分類和 GEO 分數排行。',
    url: `${SITE_URL}/directory`,
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEO 優化目錄 — AI SEO 品牌排行榜',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default async function DirectoryPage() {
  const sites = await getDirectorySnapshot();
  const itemListJsonLd = sites.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Geovault GEO 品牌排行榜',
        itemListElement: sites.map((site: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/directory/${site.id}`,
          name: site.name,
        })),
      }
    : null;

  return (
    <>
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <DirectoryClient />
      {sites.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="text-xl font-bold text-white mb-4">GEO 熱門品牌快照</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site: any) => (
              <a key={site.id} href={`/directory/${site.id}`} className="block rounded-lg border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors">
                <h3 className="font-semibold text-white truncate">{site.name}</h3>
                <p className="text-xs text-blue-400 truncate">{site.url}</p>
                <p className="mt-3 text-sm text-gray-300">GEO Score: {site.bestScore}/100</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
