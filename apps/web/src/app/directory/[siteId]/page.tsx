import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SiteDetailClient from './site-detail-client';
import type { DirectorySiteDetail } from '@/hooks/use-directory';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

async function fetchSite(siteId: string): Promise<DirectorySiteDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/directory/${siteId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? json) as DirectorySiteDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { siteId: string };
}): Promise<Metadata> {
  const site = await fetchSite(params.siteId);
  if (!site) return { title: 'Site Not Found - Geovault' };

  const industryText = site.industry ? ` | ${site.industry}` : '';
  const tierText = site.tier ? ` | ${site.tier.toUpperCase()}` : '';
  const canonical = `${SITE_URL}/directory/${params.siteId}`;
  const title = `${site.name} - GEO Score ${site.bestScore}/100${tierText}`;
  const description = `${site.name} (${site.url}) has a GEO score of ${site.bestScore}/100${industryText}. View its AI visibility profile, technical strengths, improvement priorities, and machine-readable brand data on Geovault.`;

  return {
    title,
    description,
    alternates: {
      canonical,
      types: {
        'application/rss+xml': [
          { title: `${site.name} AI visibility feed RSS`, url: `${canonical}/feed` },
        ],
        'application/feed+json': [
          { title: `${site.name} AI visibility feed JSON`, url: `${canonical}/feed.json` },
        ],
      },
    },
    openGraph: {
      title: `${site.name} - GEO Score ${site.bestScore}/100`,
      description,
      url: canonical,
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${site.name} - GEO Score ${site.bestScore}/100`,
      description,
      images: [OG_IMAGE],
    },
    robots: site.seoIndexable === false
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

export default async function SiteDetailPage({
  params,
}: {
  params: { siteId: string };
}) {
  const site = await fetchSite(params.siteId);
  if (!site) notFound();

  const canonical = `${SITE_URL}/directory/${params.siteId}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${site.name} - GEO Score ${site.bestScore}/100`,
    description: `${site.name} AI visibility profile with GEO score ${site.bestScore}/100`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    about: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      ...(site.industry && { knowsAbout: site.industry }),
    },
    identifier: 'GEOVAULT-2026-APAC-PRIME',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteDetailClient siteId={params.siteId} initialSite={site} />
    </>
  );
}
