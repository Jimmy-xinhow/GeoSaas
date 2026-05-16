import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustryRankingClient from './industry-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getIndustrySites(industry: string) {
  try {
    const res = await fetch(`${API_URL}/api/directory?industry=${encodeURIComponent(industry)}&limit=10`, {
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

  return {
    title: `${industryLabel} — AI 搜尋推薦排行`,
    description: `${industryLabel}行業的 AI 搜尋推薦排行榜。查看哪些品牌被 ChatGPT、Claude、Perplexity、Gemini、Copilot 最常推薦，以及各平台的引用率分析。`,
    alternates: {
      canonical: `${SITE_URL}/industry/${params.industry}`,
    },
    openGraph: {
      title: `${industryLabel} — AI 搜尋推薦排行`,
      description: `${industryLabel}行業 AI 引用率排行與各平台推薦分析。`,
      url: `${SITE_URL}/industry/${params.industry}`,
      type: 'website',
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${industryLabel} — AI 搜尋推薦排行`,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

export default async function IndustryRankingPage({
  params,
}: {
  params: { industry: string };
}) {
  const sites = await getIndustrySites(params.industry);
  const industryLabel = INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;
  const itemListJsonLd = sites.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${industryLabel} AI 搜尋推薦排行`,
        itemListElement: sites.map((site: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/industry/${params.industry}/${site.id}`,
          name: site.name,
        })),
      }
    : null;

  return (
    <>
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <IndustryRankingClient params={params} />
      {sites.length > 0 && (
        <section className="bg-gray-50 max-w-5xl mx-auto px-4 pb-16">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{industryLabel} 熱門品牌索引</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.map((site: any) => (
              <a key={site.id} href={`/industry/${params.industry}/${site.id}`} className="block rounded-lg border bg-white p-5 hover:border-blue-300 transition-colors">
                <h3 className="font-semibold text-gray-900">{site.name}</h3>
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
