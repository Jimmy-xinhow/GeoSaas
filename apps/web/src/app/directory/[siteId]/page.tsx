import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SiteDetailClient from './site-detail-client';
import type { DirectorySiteDetail } from '@/hooks/use-directory';
import { serializeJsonLd } from '@/lib/json-ld';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

async function fetchSite(siteId: string): Promise<DirectorySiteDetail | null> {
  const result = await fetchSiteResult(siteId);
  return result.site;
}

async function fetchSiteResult(siteId: string): Promise<{ site: DirectorySiteDetail | null; status: number | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/directory/${siteId}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { site: null, status: res.status };
    const json = await res.json().catch(() => null);
    const site = (json?.data ?? json) as DirectorySiteDetail | null;
    if (!site || typeof site !== 'object' || !('id' in site)) {
      return { site: null, status: 404 };
    }
    return { site, status: res.status };
  } catch {
    return { site: null, status: null };
  }
}

function truncateMeta(value: string, max = 155): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function truncateTitle(value: string, max = 34): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: { siteId: string };
}): Promise<Metadata> {
  const site = await fetchSite(params.siteId);
  if (!site) return { title: 'Site Not Found - Geovault' };

  const industryText = site.industry ? `，行業：${site.industry}` : '';
  const tierText = site.tier ? ` ${site.tier.toUpperCase()}` : '';
  const canonical = `${SITE_URL}/directory/${params.siteId}`;
  const title = `${truncateTitle(site.name)} GEO 技術準備度 ${site.bestScore}/100${tierText}`;
  const description = truncateMeta(
    `${site.name} 的 Geovault GEO 技術準備度為 ${site.bestScore}/100${industryText}。查看公開網站訊號、改善優先順序與品牌資料；分數不代表 AI 推薦機率。`,
  );

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
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
  const { site, status } = await fetchSiteResult(params.siteId);
  if (!site) {
    if (status === 404) notFound();
    throw new Error(
      status ? `Directory API returned ${status}` : 'Unable to load directory site',
    );
  }

  const canonical = `${SITE_URL}/directory/${params.siteId}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${site.name} - Geovault GEO technical readiness ${site.bestScore}/100`,
    description: `${site.name} public website technical-readiness profile; this score is not an AI recommendation probability`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    about: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      ...(site.industry && { knowsAbout: site.industry }),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <SiteDetailClient siteId={params.siteId} initialSite={site} />
    </>
  );
}
