import { Metadata } from 'next';
import DirectoryClient from './directory-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export const metadata: Metadata = {
  title: 'GEO 優化目錄 — AI SEO 品牌排行榜',
  description:
    '探索已通過 AI SEO 優化認證的品牌。查看 GEO 分數排行、行業分類、AI 爬蟲即時動態。收錄超過 700 個品牌的 AI 友善度資料。',
  keywords: ['GEO 目錄', 'AI SEO 排行', '品牌 AI 能見度', 'AI 搜尋優化', 'GEO 分數'],
  alternates: {
    canonical: `${SITE_URL}/directory`,
  },
  openGraph: {
    title: 'GEO 優化目錄 — AI SEO 品牌排行榜',
    description: '收錄超過 700 個品牌的 AI 友善度資料，按行業分類和 GEO 分數排行。',
    url: `${SITE_URL}/directory`,
    type: 'website',
  },
};

export default function DirectoryPage() {
  return <DirectoryClient />;
}
