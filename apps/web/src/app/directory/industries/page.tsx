import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustriesClient from './industries-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export const metadata: Metadata = {
  title: '行業分類總覽 — 22 大產業 AI 搜尋優化現況',
  description:
    '查看 22 大行業的 AI 搜尋優化現況。各產業品牌數量、平均 GEO 分數、AI 引用率一覽，找到你的行業定位。',
  alternates: {
    canonical: `${SITE_URL}/directory/industries`,
  },
  openGraph: {
    title: '行業分類總覽 — AI 搜尋優化現況',
    description: '22 大行業的 AI 搜尋優化數據一覽。',
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

export default function IndustriesPage() {
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '行業分類總覽',
    description: 'Geovault 收錄的各行業 AI 搜尋優化現況與 GEO 分數索引。',
    url: `${SITE_URL}/directory/industries`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: INDUSTRIES.map((industry, index) => ({
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
        </div>
      </section>
    </>
  );
}
