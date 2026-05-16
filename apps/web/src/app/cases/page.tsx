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
      <section className="bg-gray-900 text-white max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold mb-4">如何判讀 GEO 成功案例</h2>
        <div className="space-y-4 text-sm leading-7 text-gray-300">
          <p>
            Geovault 的成功案例庫聚焦在「品牌是否真的被 AI 回答引用」，而不是只展示一般 SEO 排名。
            每個案例都會記錄使用者實際提問、AI 平台、回應摘要、優化前後 GEO 分數，以及可能影響引用結果的技術項目。
          </p>
          <p>
            對正在建立 AI 搜尋能見度的品牌來說，這些案例可以用來比對三件事：第一，AI 是否能理解品牌提供的服務；
            第二，網站是否具備 llms.txt、JSON-LD、FAQ Schema、品牌知識庫等機器可讀訊號；第三，內容是否足夠具體，
            讓 ChatGPT、Claude、Perplexity、Gemini 或 Copilot 在回答使用者問題時有明確依據。
          </p>
          <p>
            案例分數的變化代表網站從「可被搜尋」逐步走向「可被 AI 引用」。分數提升通常來自結構化資料補強、
            問答內容擴充、品牌資訊一致化與持續監控。若你的品牌已經出現在 AI 回答中，可以提交案例讓更多使用者了解
            哪些內容與技術訊號真正有效。
          </p>
        </div>
      </section>
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
