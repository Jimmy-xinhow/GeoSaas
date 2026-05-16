import { Metadata } from 'next';
import GuideClient from './guide-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title: 'GEO 優化教學指南 — 8 步驟讓 AI 推薦你的品牌',
  description:
    '完整的 GEO（Generative Engine Optimization）優化教學。從掃描檢測、AI 自動修復、品牌知識庫到引用監控，8 個步驟讓你的品牌被 ChatGPT、Claude、Perplexity 主動推薦。',
  keywords: ['GEO 教學', 'AI SEO 指南', 'AI 搜尋優化步驟', 'llms.txt 教學', 'JSON-LD 教學'],
  alternates: {
    canonical: `${SITE_URL}/guide`,
  },
  openGraph: {
    title: 'GEO 優化教學指南 — 8 步驟讓 AI 推薦你的品牌',
    description: '完整的 GEO 優化教學，從掃描到 AI 引用驗證，8 個步驟全攻略。',
    url: `${SITE_URL}/guide`,
    type: 'article',
    images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GEO 優化教學指南',
    description: '8 步驟讓 AI 推薦你的品牌',
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
    { '@type': 'HowToStep', name: '建立 llms.txt', text: '提供 AI 爬蟲可直接讀取的品牌摘要、服務項目與重點頁面。' },
    { '@type': 'HowToStep', name: '整理品牌知識庫', text: '把服務範圍、專業證據、價格流程與常見問題整理成可引用內容。' },
    { '@type': 'HowToStep', name: '監控 AI 引用', text: '定期測試 ChatGPT、Claude、Perplexity、Gemini 與 Copilot 是否引用品牌。' },
  ],
  publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
};

export default function GuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd) }} />
      <GuideClient />
    </>
  );
}
