import { Metadata } from 'next';
import CasesClient from './cases-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

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
  },
};

export default function CasesPage() {
  return <CasesClient />;
}
