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

export default function GuidePage() {
  return <GuideClient />;
}
