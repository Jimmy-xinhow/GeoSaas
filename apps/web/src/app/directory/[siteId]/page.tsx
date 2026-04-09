import { Metadata } from 'next';
import SiteDetailClient from './site-detail-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

export async function generateMetadata({
  params,
}: {
  params: { siteId: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${API_BASE}/api/directory/${params.siteId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: 'Site Not Found — GEO 目錄' };
    const json = await res.json();
    const site = json.data;

    const industryText = site.industry ? ` | ${site.industry}` : '';
    const tierText = site.tier ? ` | ${site.tier.toUpperCase()}` : '';

    return {
      title: `${site.name} — GEO 分數 ${site.bestScore}/100${tierText}`,
      description: `${site.name} (${site.url}) 的 AI 可見度分數為 ${site.bestScore}/100。${industryText ? `行業：${site.industry}。` : ''}查看完整的 AI 優化指標、爬蟲活動和品牌知識庫。`,
      alternates: {
        canonical: `${SITE_URL}/directory/${params.siteId}`,
      },
      openGraph: {
        title: `${site.name} — GEO Score: ${site.bestScore}/100`,
        description: `AI visibility optimization profile for ${site.name}`,
        url: `${SITE_URL}/directory/${params.siteId}`,
        type: 'website',
        images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${site.name} — GEO Score: ${site.bestScore}/100`,
        images: [OG_IMAGE],
      },
    };
  } catch {
    return { title: 'GEO 目錄' };
  }
}

async function getSiteData(siteId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/directory/${siteId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export default async function SiteDetailPage({
  params,
}: {
  params: { siteId: string };
}) {
  const site = await getSiteData(params.siteId);

  const jsonLd = site
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${site.name} — GEO 分數 ${site.bestScore}/100`,
        description: `${site.name} 的 AI 可見度分數為 ${site.bestScore}/100`,
        url: `${SITE_URL}/directory/${params.siteId}`,
        isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
        about: {
          '@type': 'Organization',
          name: site.name,
          url: site.url,
          ...(site.industry && { knowsAbout: site.industry }),
        },
        identifier: 'GEOVAULT-2026-APAC-PRIME',
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <SiteDetailClient siteId={params.siteId} />
    </>
  );
}
