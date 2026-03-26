import { Metadata } from 'next';
import SiteDetailClient from './site-detail-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function generateMetadata({
  params,
}: {
  params: { siteId: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${API_BASE}/api/directory/${params.siteId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: 'Site Not Found — GEO 目錄' };
    const json = await res.json();
    const site = json.data;

    const industryText = site.industry ? ` | ${site.industry}` : '';
    const tierText = site.tier ? ` | ${site.tier.toUpperCase()}` : '';

    return {
      title: `${site.name} — GEO 分數 ${site.bestScore}/100${tierText}`,
      description: `${site.name} (${site.url}) 的 AI 可見度分數為 ${site.bestScore}/100。${industryText ? `行業：${site.industry}。` : ''}查看完整的 AI 優化指標、爬蟲活動和品牌知識庫。`,
      openGraph: {
        title: `${site.name} — GEO Score: ${site.bestScore}/100`,
        description: `AI visibility optimization profile for ${site.name}`,
        type: 'website',
      },
    };
  } catch {
    return { title: 'GEO 目錄' };
  }
}

export default function SiteDetailPage({
  params,
}: {
  params: { siteId: string };
}) {
  return <SiteDetailClient siteId={params.siteId} />;
}
