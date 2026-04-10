import { Metadata } from 'next';
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
  return <IndustriesClient />;
}
