import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustryWikiClient from './industry-wiki-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';
const OG_IMAGE = `${SITE_URL}/og-image.png`;

async function getIndustryDirectorySnapshot(industry: string) {
  try {
    const res = await fetch(`${API_URL}/api/directory?industry=${encodeURIComponent(industry)}&limit=12`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;
  const title = `${industryLabel} GEO 與 AI 搜尋優化完整指南`;
  const description = `${industryLabel}行業的 AI 搜尋優化完整指南。查看行業平均 GEO 分數、品牌排行、指標通過率與 AI 可讀內容建議。`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/directory/industry/${params.industry}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/directory/industry/${params.industry}`,
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}

export default async function IndustryWikiPage({ params }: { params: { industry: string } }) {
  const sites = await getIndustryDirectorySnapshot(params.industry);
  const industryLabel = INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;
  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${industryLabel} GEO 與 AI 搜尋優化完整指南`,
    description: `${industryLabel}行業的品牌 GEO 分數、AI 可讀性與公開品牌索引。`,
    url: `${SITE_URL}/directory/industry/${params.industry}`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    about: { '@type': 'Thing', name: `${industryLabel} AI 搜尋優化` },
  };
  const itemListJsonLd = sites.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${industryLabel} GEO 品牌索引`,
        itemListElement: sites.map((site: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/directory/${site.id}`,
          name: site.name,
        })),
      }
    : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <IndustryWikiClient />
      {sites.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{industryLabel} 品牌索引快照</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site: any) => (
              <a key={site.id} href={`/directory/${site.id}`} className="block rounded-lg border bg-white p-5 hover:border-blue-300 transition-colors">
                <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
                <p className="text-xs text-blue-600 truncate">{site.url}</p>
                <p className="mt-2 text-sm text-gray-600">GEO Score: {site.bestScore}/100</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
