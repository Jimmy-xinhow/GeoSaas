import { Metadata } from 'next';
import { INDUSTRIES } from '@geovault/shared';
import CompareClient from './compare-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export async function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;

  return {
    title: `${industryLabel} — AI 品牌比較`,
    description: `比較 ${industryLabel} 行業中不同品牌的 AI 搜尋推薦表現。查看各品牌在 ChatGPT、Claude、Perplexity、Gemini、Copilot 的引用率差異。`,
    alternates: {
      canonical: `${SITE_URL}/industry/${params.industry}/compare`,
    },
    openGraph: {
      title: `${industryLabel} — AI 品牌比較`,
      description: `${industryLabel}行業 AI 搜尋推薦品牌比較工具。`,
      url: `${SITE_URL}/industry/${params.industry}/compare`,
      type: 'website',
    },
  };
}

export default function ComparePage({
  params,
}: {
  params: { industry: string };
}) {
  return <CompareClient params={params} />;
}
