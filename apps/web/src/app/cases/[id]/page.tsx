import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CaseDetailClient from './case-detail-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  copilot: 'Copilot',
};

async function getCaseData(id: string) {
  try {
    const res = await fetch(`${API_BASE}/api/success-cases/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'data')) {
      return payload.data || null;
    }
    return payload;
  } catch {
    return null;
  }
}

function truncateDescription(value: string, max = 155): string {
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
  params: { id: string };
}): Promise<Metadata> {
  const caseData = await getCaseData(params.id);
  if (!caseData) return { title: 'GEO 成功案例 | Geovault' };

  const platformLabel = PLATFORM_LABELS[caseData.aiPlatform] || caseData.aiPlatform;
  const scoreChange =
    caseData.beforeGeoScore != null && caseData.afterGeoScore != null
      ? ` GEO ${caseData.beforeGeoScore}->${caseData.afterGeoScore}`
      : '';
  const title = `${truncateTitle(caseData.title)} | ${platformLabel} AI 引用案例${scoreChange}`;
  const description = truncateDescription(
    `${caseData.title} 的 AI 引用成功案例，使用者提問：「${caseData.queryUsed}」。了解品牌如何提升 GEO 能見度並被 ${platformLabel} 引用。`,
  );

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/cases/${params.id}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cases/${params.id}`,
      type: 'article',
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

export default async function CaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const caseData = await getCaseData(params.id);
  if (!caseData) notFound();

  const platformLabel = PLATFORM_LABELS[caseData.aiPlatform] || caseData.aiPlatform;
  const canonical = `${SITE_URL}/cases/${params.id}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: caseData.title,
    description: truncateDescription(
      `${caseData.title} 的 AI 引用成功案例，使用者提問：「${caseData.queryUsed}」。`,
      200,
    ),
    mainEntityOfPage: canonical,
    datePublished: caseData.createdAt,
    dateModified: caseData.updatedAt || caseData.createdAt,
    author: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Geovault',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/opengraph-image` },
    },
    about: [
      { '@type': 'Thing', name: 'Generative Engine Optimization' },
      { '@type': 'Thing', name: platformLabel },
      ...(caseData.industry ? [{ '@type': 'Thing', name: caseData.industry }] : []),
    ],
    keywords: ['GEO 成功案例', 'AI 引用', platformLabel, ...(caseData.tags || [])].join(', '),
    identifier: 'GEOVAULT-2026-APAC-PRIME',
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'GEO 成功案例', item: `${SITE_URL}/cases` },
      { '@type': 'ListItem', position: 3, name: caseData.title, item: canonical },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <CaseDetailClient initialCase={caseData} />
    </>
  );
}
