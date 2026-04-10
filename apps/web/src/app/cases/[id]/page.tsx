import { Metadata } from 'next';
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

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${API_BASE}/api/success-cases/${params.id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: '成功案例' };
    const caseData = await res.json();

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
  } catch {
    return { title: 'GEO 成功案例' };
  }
}

export default function CaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CaseDetailClient />;
}
