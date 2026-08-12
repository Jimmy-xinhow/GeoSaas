import { Metadata } from 'next';
import GuideClient from './guide-client';
import { serializeJsonLd } from '@/lib/json-ld';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

export const metadata: Metadata = {
  title: 'GEO 優化教學指南 — 8 步驟建立可驗收的 AI 搜尋能見度',
  description:
    '完整的 GEO 優化教學：從技術準備度掃描、內容修復、品牌知識庫到固定問題集引用驗收；不把技術分數當成 AI 推薦保證。',
  keywords: ['GEO 教學', 'AI SEO 指南', 'AI 搜尋優化步驟', 'llms.txt 教學', 'JSON-LD 教學'],
  alternates: {
    canonical: `${SITE_URL}/guide`,
  },
  openGraph: {
    title: 'GEO 優化教學指南 — 建立可驗收的 AI 搜尋能見度',
    description: '完整的 GEO 優化教學，從掃描到 AI 引用驗證，8 個步驟全攻略。',
    url: `${SITE_URL}/guide`,
    type: 'article',
    images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEO 優化教學指南',
    description: '8 步驟改善技術準備度，並用問題集驗收實際 AI 提及與來源。',
    images: [OG_IMAGE],
  },
};

const guideJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'GEO 優化教學指南',
  description:
    '8 步驟建立 AI 搜尋能見度，包含網站掃描、llms.txt、JSON-LD、品牌知識庫、AI 引用監控與持續優化。',
  url: `${SITE_URL}/guide`,
  image: OG_IMAGE,
  totalTime: 'P7D',
  supply: [
    { '@type': 'HowToSupply', name: '品牌網站' },
    { '@type': 'HowToSupply', name: '品牌介紹與常見問題' },
    { '@type': 'HowToSupply', name: 'Geovault GEO 掃描報告' },
  ],
  step: [
    { '@type': 'HowToStep', name: '掃描網站', text: '先檢查網站是否具備 AI 可讀性與基本 GEO 訊號。' },
    { '@type': 'HowToStep', name: '補齊結構化資料', text: '設定 JSON-LD、Open Graph、FAQ Schema 與清楚的 meta description。' },
    { '@type': 'HowToStep', name: '評估是否建立 llms.txt', text: '核心 SEO 與可索引內容完成後，可選用 llms.txt 提供品牌摘要與重點頁面；它不取代 robots.txt 或 sitemap。' },
    { '@type': 'HowToStep', name: '整理品牌知識庫', text: '把服務範圍、專業證據、價格流程與常見問題整理成可引用內容。' },
    { '@type': 'HowToStep', name: '監控 AI 引用', text: '定期測試 ChatGPT、Claude、Perplexity、Gemini 與 Copilot 是否引用品牌。' },
  ],
  publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
};

export default function GuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(guideJsonLd) }} />
      <GuideClient />
    </>
  );
}
