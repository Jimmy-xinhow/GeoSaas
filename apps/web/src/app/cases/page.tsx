import { Metadata } from 'next';
import CasesClient from './cases-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

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

export default function CasesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CasesClient />
    </>
  );
}
