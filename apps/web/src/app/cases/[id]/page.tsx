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
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const caseData = await getCaseData(params.id);
  if (!caseData) return { title: 'GEO 成功案例' };

  const platformLabel = PLATFORM_LABELS[caseData.aiPlatform] || caseData.aiPlatform;
  const scoreChange =
    caseData.beforeGeoScore != null && caseData.afterGeoScore != null
      ? ` | GEO ${caseData.beforeGeoScore} → ${caseData.afterGeoScore}`
      : '';

  return {
    title: `${caseData.title} — ${platformLabel} 引用案例${scoreChange}`,
    description: `${caseData.title}。AI 搜尋問題：「${caseData.queryUsed}」。透過 GEO 優化成功被 ${platformLabel} 主動推薦。`,
    alternates: {
      canonical: `${SITE_URL}/cases/${params.id}`,
    },
    openGraph: {
      title: caseData.title,
      description: `被 ${platformLabel} 主動引用的成功案例${scoreChange}`,
      url: `${SITE_URL}/cases/${params.id}`,
      type: 'article',
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${caseData.title} — ${platformLabel} 引用案例`,
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

  return <CaseDetailClient />;
}
