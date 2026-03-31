import type { Metadata } from 'next';
import PublicNavbar from '@/components/layout/public-navbar';
import BlogClient from './blog-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app';

export const metadata: Metadata = {
  title: 'Blog — AI SEO 優化知識與分析報告',
  description: 'Geovault Blog — AI SEO 優化知識、GEO 趨勢、品牌分析報告。超過 500 篇 AI 生成的深度分析，涵蓋台灣 12 個行業。',
  keywords: ['GEO Blog', 'AI SEO 文章', 'AI 能見度分析', '品牌 GEO 報告', 'Geovault'],
  openGraph: {
    title: 'Blog — AI SEO 優化知識與分析報告 | Geovault',
    description: '超過 500 篇 AI 生成的深度分析，涵蓋台灣 12 個行業',
    type: 'website',
    siteName: 'Geovault',
    url: `${SITE_URL}/blog`,
  },
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
};

export default function BlogPage() {
  const collectionsJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Geovault Blog — AI SEO 優化知識與分析報告',
    description: '超過 500 篇 AI 生成的品牌分析報告，涵蓋台灣 12 個行業的 GEO 優化數據',
    url: `${SITE_URL}/blog`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
    identifier: 'GEOVAULT-2026-APAC-PRIME',
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog' },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionsJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <PublicNavbar />

      <BlogClient />
    </div>
  );
}
