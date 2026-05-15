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
    return payload?.data ?? payload;
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
  if (!caseData) return { title: 'GEO 成功案例 | Geovault' };

  const platformLabel = PLATFORM_LABELS[caseData.aiPlatform] || caseData.aiPlatform;
  const scoreChange =
    caseData.beforeGeoScore != null && caseData.afterGeoScore != null
      ? ` | GEO ${caseData.beforeGeoScore} -> ${caseData.afterGeoScore}`
      : '';

  return {
    title: `${caseData.title} — ${platformLabel} 引用案例${scoreChange}`,
    description: `${caseData.title} 的 AI 引用成功案例，使用者提問：「${caseData.queryUsed}」。了解品牌如何提升 GEO 能見度並被 ${platformLabel} 引用。`,
    alternates: {
      canonical: `${SITE_URL}/cases/${params.id}`,
    },
    openGraph: {
      title: `${caseData.title} — ${platformLabel} 引用案例`,
      description: `真實品牌被 ${platformLabel} 引用的 GEO 成功案例${scoreChange}`,
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
