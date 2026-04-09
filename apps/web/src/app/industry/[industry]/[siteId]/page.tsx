import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import BrandDetailClient from './brand-detail-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export async function generateMetadata({
  params,
}: {
  params: { industry: string; siteId: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;

  try {
    const res = await fetch(
      `${API_BASE}/api/industry-ai/${params.industry}/brand/${params.siteId}/impression`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const siteName = data.site?.name || params.siteId;

    return {
      title: `${siteName} — ${industryLabel} AI 品牌印象分析`,
      description: `${siteName} 在 ${industryLabel} 行業的 AI 搜尋印象分析。查看 5 大 AI 平台對此品牌的評價、推薦語氣與引用趨勢。`,
      alternates: {
        canonical: `${SITE_URL}/industry/${params.industry}/${params.siteId}`,
      },
      openGraph: {
        title: `${siteName} — AI 品牌印象分析`,
        description: `${industryLabel}行業中 ${siteName} 的 AI 搜尋推薦分析。`,
        url: `${SITE_URL}/industry/${params.industry}/${params.siteId}`,
        type: 'article',
      },
    };
  } catch {
    return {
      title: `${industryLabel} — AI 品牌印象分析`,
    };
  }
}

export default function BrandDetailPage({
  params,
}: {
  params: { industry: string; siteId: string };
}) {
  return <BrandDetailClient params={params} />;
}
