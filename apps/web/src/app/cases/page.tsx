import { Metadata } from 'next';
import CasesClient from './cases-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

async function getCaseSnapshot() {
  try {
    const res = await fetch(`${API_URL}/api/success-cases?limit=8`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

export const metadata: Metadata = {
  title: 'GEO 成功案例 — 真實品牌被 AI 引用的故事',
  description:
    '真實品牌被 ChatGPT、Claude、Perplexity、Gemini、Copilot 主動推薦的成功案例。看看他們如何透過 GEO 優化提升 AI 搜尋能見度。',
  keywords: ['GEO 成功案例', 'AI 引用', 'ChatGPT 推薦', 'AI SEO 案例', '品牌被 AI 推薦'],
  alternates: {
    canonical: `${SITE_URL}/cases`,
  },
  openGraph: {
    title: 'GEO 成功案例 — 真實品牌被 AI 引用的故事',
    description: '看看各行各業的品牌如何被 5 大 AI 平台主動推薦。',
    url: `${SITE_URL}/cases`,
    type: 'website',
    images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEO 成功案例 — 真實品牌被 AI 引用的故事',
    images: [OG_IMAGE],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'GEO 成功案例',
  description: '真實品牌被 AI 引用的成功故事合集',
  url: `${SITE_URL}/cases`,
  isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
  publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
  identifier: 'GEOVAULT-2026-APAC-PRIME',
};

export default async function CasesPage() {
  const cases = await getCaseSnapshot();
  const itemListJsonLd = cases.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Geovault GEO 成功案例',
        itemListElement: cases.map((item: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/cases/${item.id}`,
          name: item.title,
        })),
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <CasesClient />
      {cases.length > 0 && (
        <section className="bg-gray-900 text-white max-w-4xl mx-auto px-6 pb-16">
          <h2 className="text-lg font-bold mb-4">最新 GEO 成功案例</h2>
          <div className="space-y-3">
            {cases.map((item: any) => (
              <a key={item.id} href={`/cases/${item.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-colors">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-yellow-200/60 line-clamp-1">{item.queryUsed}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
