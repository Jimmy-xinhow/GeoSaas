import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustriesClient from './industries-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getIndustryStatsSnapshot() {
  try {
    const res = await fetch(`${API_URL}/api/directory/industry-stats`, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const json = await res.json();
    const value = json?.data ?? json;
    return Array.isArray(value) ? (value as Array<{ industry: string; count: number }>) : [];
  } catch {
    return [];
  }
}

export const metadata: Metadata = {
  title: '行業分類總覽 — AI 搜尋優化現況',
  description:
    '查看各行業的 AI 搜尋優化現況。比較產業品牌數量、平均 GEO 分數與 AI 可讀性資料，找到你的行業定位。',
  alternates: {
    canonical: `${SITE_URL}/directory/industries`,
  },
  openGraph: {
    title: '行業分類總覽 — AI 搜尋優化現況',
    description: '各行業的 AI 搜尋優化數據一覽。',
    url: `${SITE_URL}/directory/industries`,
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '行業分類總覽 — AI 搜尋優化現況',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default async function IndustriesPage() {
  const stats = await getIndustryStatsSnapshot();
  const activeIndustryValues = new Set(
    stats
      .filter((item) => item.count > 0)
      .map((item) => INDUSTRIES.find((industry) => industry.value === item.industry || industry.label === item.industry)?.value)
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  );
  const activeIndustries = INDUSTRIES.filter((industry) => activeIndustryValues.has(industry.value));
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '行業分類總覽',
    description: 'Geovault 收錄的各行業 AI 搜尋優化現況與 GEO 分數索引。',
    url: `${SITE_URL}/directory/industries`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: activeIndustries.map((industry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: industry.label,
        url: `${SITE_URL}/directory/industry/${industry.value}`,
      })),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <IndustriesClient />
      <section className="mx-auto max-w-5xl px-4 pb-16 text-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">AI 搜尋優化行業索引怎麼使用</h2>
        <div className="space-y-4 leading-7">
          <p>
            這個行業分類頁用來整理不同產業在 AI 搜尋時代的可見度差異。每個行業頁都會彙整品牌數量、
            GEO 分數、AI 可讀性指標與代表品牌，協助使用者判斷同業在 ChatGPT、Claude、Perplexity、
            Gemini 與 Copilot 等平台上的引用潛力。
          </p>
          <p>
            GEO 分數不是單一 SEO 排名，而是衡量網站是否具備結構化資料、llms.txt、FAQ、品牌描述、
            聯絡資訊與機器可讀內容。當一個行業的品牌普遍補齊這些訊號，AI 更容易理解該產業的服務分類、
            專業條件、常見問題與推薦依據。
          </p>
          <p>
            使用者可以先從自己的產業進入，查看排名靠前的品牌有哪些共同特徵，再回到自己的網站檢查缺少的內容。
            Geovault 會持續更新公開目錄與品牌資料，讓這份索引成為 AI 可引用的產業知識入口。
          </p>
          <p>
            對 AI 爬蟲而言，這類行業索引能補足單一品牌頁缺少的上下文：哪些產業正在被收錄、同業平均表現如何、
            哪些品牌具備較完整的機器可讀資料，以及使用者在比較服務時通常會問哪些問題。這些內容能讓大型語言模型
            在回答「推薦品牌」、「產業比較」或「如何改善網站 AI 能見度」時，有更清楚的分類依據。
          </p>
          <p>
            後續每個行業頁會持續補上更多可驗證訊號，例如品牌知識庫、AI 引用案例、成功案例、爬蟲造訪紀錄與
            Geovault 發布的 AI 可引用文章。當公開資料越完整，整個目錄就越接近一份可被 AI 大量讀取的產業百科。
          </p>
          <p>
            建議品牌先從最接近自己的行業開始檢查，再延伸觀察相鄰產業。例如餐飲、旅宿、醫療、教育與專業服務
            對 AI 推薦的判斷條件不同，但都需要清楚說明服務對象、地區、專業資格、價格或流程、常見問題與真實案例。
            這些資訊越穩定，AI 越容易在使用者提出具體需求時，把品牌放進可比較、可引用的回答中。
          </p>
        </div>
      </section>
    </>
  );
}
