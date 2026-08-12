import { Metadata } from 'next';
import CasesClient from './cases-client';
import { serializeJsonLd } from '@/lib/json-ld';

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

export async function generateMetadata(): Promise<Metadata> {
  const cases = await getCaseSnapshot();
  const hasCases = cases.length > 0;
  const title = hasCases
    ? 'GEO 成功案例庫｜附 AI 回應證據的品牌引用紀錄'
    : 'GEO 成功案例驗證方法｜案例庫建置中';
  const description = hasCases
    ? '收錄經審核且附 AI 回應證據的 GEO 案例，整理實際提問、AI 平台、回應摘要與優化前後技術準備度。'
    : '目前尚無通過公開證據門檻的 GEO 成功案例；本頁公開說明截圖、實際提問、來源與人工審核標準。';
  return {
    title,
    description,
    keywords: ['GEO 成功案例', 'AI 引用驗證', 'AI 回應證據', 'AI SEO 案例'],
    alternates: { canonical: `${SITE_URL}/cases` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cases`,
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}

export default async function CasesPage() {
  const cases = await getCaseSnapshot();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: cases.length > 0 ? 'GEO 成功案例' : 'GEO 成功案例驗證方法',
    description: cases.length > 0
      ? '經審核且附 AI 回應證據的品牌引用案例合集'
      : '目前公開案例數為 0，頁面說明 AI 引用案例的證據與審核門檻',
    url: `${SITE_URL}/cases`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
  };
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }} />
      )}
      <CasesClient />
      {cases.length === 0 && (
        <section className="bg-gray-900 text-white max-w-4xl mx-auto px-6 pt-10">
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-6">
            <p className="text-sm font-semibold text-amber-200">目前公開案例數：0</p>
            <p className="mt-2 text-sm leading-7 text-amber-50/80">
              Geovault 不會用技術分數或未附來源的文字冒充成功案例。案例必須包含實際提問、平台、日期、完整 AI 回應與可核對截圖，並通過人工審核後才公開。
            </p>
          </div>
        </section>
      )}
      <section className="bg-gray-900 text-white max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold mb-4">如何判讀 GEO 成功案例</h2>
        <div className="space-y-4 text-sm leading-7 text-gray-300">
          <p>
            Geovault 的成功案例庫聚焦在「品牌是否真的被 AI 回答引用」，而不是只展示一般 SEO 排名。
            公開案例必須通過人工審核並附 AI 回應截圖，同時記錄實際提問、AI 平台、回應摘要、優化前後 GEO 分數，
            以及可能影響引用結果的技術項目。
          </p>
          <p>
            對正在建立 AI 搜尋能見度的品牌來說，這些案例可以用來比對三件事：第一，AI 是否能理解品牌提供的服務；
            第二，網站是否具備可索引內容、JSON-LD、FAQ、品牌知識庫等機器可讀訊號（llms.txt 僅為選用補充）；第三，內容是否足夠具體，
            讓 ChatGPT、Claude、Perplexity、Gemini 或 Copilot 在回答使用者問題時有明確依據。
          </p>
          <p>
            案例中的分數變化只代表 Geovault 技術準備度改變，不能單獨證明 AI 引用由此造成。案例必須同時保留修改時間線、
            固定問題集與平台回答，才能讓讀者判斷結構化資料、內容補強或品牌資訊一致化是否與結果變化同時發生。
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
