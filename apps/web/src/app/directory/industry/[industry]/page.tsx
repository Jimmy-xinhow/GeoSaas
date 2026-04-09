import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import IndustryWikiClient from './industry-wiki-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export async function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;

  return {
    title: `${industryLabel} AI 搜尋優化完整指南`,
    description: `${industryLabel}行業的 AI 搜尋優化完整指南。查看行業平均 GEO 分數、等級分布、各項指標通過率，以及所有品牌的 AI 友善度排行。`,
    alternates: {
      canonical: `${SITE_URL}/directory/industry/${params.industry}`,
    },
    openGraph: {
      title: `${industryLabel} AI 搜尋優化完整指南`,
      description: `${industryLabel}行業 GEO 分數排行與 AI 可讀性分析。`,
      url: `${SITE_URL}/directory/industry/${params.industry}`,
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${industryLabel} AI 搜尋優化完整指南`,
      description: `${industryLabel}行業 GEO 分數排行與 AI 可讀性分析。`,
      images: [OG_IMAGE],
    },
  };
}

export default function IndustryWikiPage() {
  return <IndustryWikiClient />;
}
