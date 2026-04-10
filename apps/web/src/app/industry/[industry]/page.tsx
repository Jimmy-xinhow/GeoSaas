import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustryRankingClient from './industry-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

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

export default function IndustryRankingPage({
  params,
}: {
  params: { industry: string };
}) {
  return <IndustryRankingClient params={params} />;
}
