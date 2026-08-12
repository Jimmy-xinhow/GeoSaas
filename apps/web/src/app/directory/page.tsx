import { Metadata } from 'next';
import DirectoryClient from './directory-client';
import { serializeJsonLd } from '@/lib/json-ld';

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
  title: 'GEO 技術準備度品牌目錄',
  description:
    '探索公開品牌頁面的 GEO 技術準備度、行業分類與可索引資料。分數反映網站技術訊號，不代表 AI 平台的推薦或引用機率。',
  keywords: ['GEO 目錄', 'AI 搜尋技術準備度', '品牌公開資料', 'AI 搜尋優化', 'GEO 技術分數'],
  alternates: {
    canonical: `${SITE_URL}/directory`,
  },
  openGraph: {
    title: 'GEO 技術準備度品牌目錄',
    description: '依行業與技術準備度整理公開品牌頁面；分數不等於第三方 AI 平台的推薦或引用機率。',
    url: `${SITE_URL}/directory`,
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEO 技術準備度品牌目錄',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default async function DirectoryPage() {
  const sites = await getDirectorySnapshot();
  const itemListJsonLd = sites.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Geovault GEO 技術準備度品牌目錄',
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }} />
      )}
      <DirectoryClient />
      {sites.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="text-xl font-bold text-white mb-4">GEO 技術準備度快照</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site: any) => (
              <a key={site.id} href={`/directory/${site.id}`} className="block rounded-lg border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors">
                <h3 className="font-semibold text-white truncate">{site.name}</h3>
                <p className="text-xs text-blue-400 truncate">{site.url}</p>
                <p className="mt-3 text-sm text-gray-300">GEO 技術準備度：{site.bestScore}/100</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
