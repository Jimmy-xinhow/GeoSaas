import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INDUSTRIES } from '@geovault/shared';
import IndustryRankingClient from './industry-client';
import type { RankingResponse } from '@/hooks/use-industry-ai';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

async function getIndustrySites(industry: string) {
  try {
    const res = await fetch(`${API_URL}/api/directory?industry=${encodeURIComponent(industry)}&limit=10`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.items || json?.items || [];
  } catch {
    return [];
  }
}

async function getInitialIndustryRanking(industry: string): Promise<RankingResponse | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/industry-ai/${encodeURIComponent(industry)}/ranking`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    return (json?.data ?? json) as RankingResponse;
  } catch {
    return undefined;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Promise<Metadata> {
  const industryLabel =
    INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;
  const sites = await getIndustrySites(params.industry);
  const title = `${industryLabel} AI 引用排行與品牌推薦分析`;
  const description = `${industryLabel}行業的 AI 搜尋推薦排行。查看哪些品牌較常被 ChatGPT、Claude、Perplexity、Gemini、Copilot 推薦。`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/industry/${params.industry}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/industry/${params.industry}`,
      type: 'website',
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
    robots: sites.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function IndustryRankingPage({
  params,
}: {
  params: { industry: string };
}) {
  if (!INDUSTRIES.some((item) => item.value === params.industry)) notFound();

  const sites = await getIndustrySites(params.industry);
  const initialRanking = await getInitialIndustryRanking(params.industry);
  const industryLabel = INDUSTRIES.find((i) => i.value === params.industry)?.label || params.industry;
  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${industryLabel} AI 引用排行與品牌推薦分析`,
    description: `${industryLabel}行業在 AI 搜尋中的品牌推薦排行與引用分析。`,
    url: `${SITE_URL}/industry/${params.industry}`,
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    about: { '@type': 'Thing', name: `${industryLabel} AI 引用排行` },
  };
  const itemListJsonLd = sites.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${industryLabel} AI 搜尋推薦排行`,
        itemListElement: sites.map((site: any, index: number) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/industry/${params.industry}/${site.id}`,
          name: site.name,
        })),
      }
    : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <IndustryRankingClient params={params} initialData={initialRanking} />
      {sites.length > 0 && (
        <section className="bg-gray-50 max-w-5xl mx-auto px-4 pb-16">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{industryLabel} 熱門品牌索引</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.map((site: any) => (
              <a key={site.id} href={`/industry/${params.industry}/${site.id}`} className="block rounded-lg border bg-white p-5 hover:border-blue-300 transition-colors">
                <h3 className="font-semibold text-gray-900">{site.name}</h3>
                <p className="text-xs text-blue-600 truncate">{site.url}</p>
                <p className="mt-2 text-sm text-gray-600">GEO Score: {site.bestScore}/100</p>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="bg-gray-50 max-w-5xl mx-auto px-4 pb-20">
        <div className="rounded-xl border bg-white p-6 md:p-8 text-gray-700 leading-7 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">
            {industryLabel}品牌如何提升 AI 搜尋推薦機率
          </h2>
          <p>
            在 AI 搜尋情境中，使用者通常不只輸入品牌名稱，而是提出「推薦哪一家」、「哪個服務適合我」、
            「附近有哪些選擇」這類決策型問題。Geovault 的{industryLabel}排行會整理公開品牌的 GEO 分數、
            AI 引用率、網站可讀性與品牌資料完整度，協助使用者理解哪些品牌更容易被 ChatGPT、Claude、
            Perplexity、Gemini 或 Copilot 正確辨識。
          </p>
          <p>
            對{industryLabel}業者來說，影響 AI 推薦的關鍵通常包含三個層面：網站是否具備清楚的
            JSON-LD 與 meta 資訊、是否提供 llms.txt 或其他機器可讀內容、以及品牌服務、地區、適合對象、
            常見問題是否足夠具體。當這些資料越完整，AI 在回答消費者問題時越容易引用正確品牌，而不是只引用大型平台或泛用文章。
          </p>
          <p>
            本頁的排行不是傳統廣告版位，也不是單純的 SEO 排名；它更接近 AI 可讀資料索引。每個品牌頁都會保留
            GEO 分數、指標狀態、AI 爬蟲造訪紀錄與可驗證的公開資料，讓搜尋引擎與 AI 爬蟲能用穩定格式理解
            {industryLabel}品牌的定位與可信度。
          </p>
        </div>
      </section>
    </>
  );
}
