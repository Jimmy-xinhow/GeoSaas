import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INDUSTRIES } from '@geovault/shared';
import BrandDetailClient from './brand-detail-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

async function getBrandData(industry: string, siteId: string) {
  try {
    const res = await fetch(
      `${API_BASE}/api/industry-ai/${industry}/brand/${siteId}/impression`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { industry: string; siteId: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;

  const data = await getBrandData(params.industry, params.siteId);
  if (!data) return { title: `${industryLabel} — AI 品牌印象分析` };

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
}

export default async function BrandDetailPage({
  params,
}: {
  params: { industry: string; siteId: string };
}) {
  // Validate that the industry exists
  const industryExists = INDUSTRIES.some((i) => i.value === params.industry);
  if (!industryExists) notFound();

  return <BrandDetailClient params={params} />;
}
