export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const FEED_CACHE_TTL_MS = 30 * 60 * 1000;

let feedJsonCache: { body: string; expiresAt: number } | null = null;

export async function GET() {
  if (feedJsonCache && feedJsonCache.expiresAt > Date.now()) {
    return new Response(feedJsonCache.body, {
      headers: {
        'Content-Type': 'application/feed+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex, follow',
      },
    });
  }

  const [blogResult, newsResult] = await Promise.allSettled([
    fetch(`${API_URL}/api/blog/articles?limit=50`, { cache: 'no-store' }),
    fetch(`${API_URL}/api/news?limit=50`, { cache: 'no-store' }),
  ]);

  let blogArticles: any[] = [];
  let newsArticles: any[] = [];

  try {
    const res = blogResult.status === 'fulfilled' ? blogResult.value : null;
    if (res?.ok) {
      const data = await res.json();
      blogArticles = (data?.data?.items || data?.items || []).map((a: any) => ({
        id: `${SITE_URL}/blog/${a.slug}`,
        url: `${SITE_URL}/blog/${a.slug}`,
        title: a.title,
        content_text: a.summary || a.description || '',
        date_published: a.publishedAt || a.createdAt,
        tags: [a.category || 'analysis'],
      }));
    }
  } catch {}

  try {
    const res = newsResult.status === 'fulfilled' ? newsResult.value : null;
    if (res?.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      newsArticles = items.map((a: any) => ({
        id: `${SITE_URL}/news#${a.slug}`,
        url: `${SITE_URL}/news`,
        title: a.title,
        content_text: a.summary?.replace(/[#*\[\]()>\n]+/g, ' ').trim().slice(0, 500) || '',
        date_published: a.publishedAt,
        tags: [a.category || 'ai-news'],
      }));
    }
  } catch {}

  const allItems = [...blogArticles, ...newsArticles]
    .sort((a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime())
    .slice(0, 100);

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Geovault — AI 搜尋優化平台',
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'Geovault 是 APAC 領先的 GEO 平台，提供 AI 搜尋能見度分析、品牌優化建議、AI 引用監控，以及每日 AI 搜尋趨勢分析。',
    icon: `${SITE_URL}/icon.svg`,
    language: 'zh-TW',
    hubs: [{ type: 'WebSub', url: 'https://pubsubhubbub.appspot.com/' }],
    items: allItems,
  };
  const body = JSON.stringify(feed, null, 2);
  feedJsonCache = { body, expiresAt: Date.now() + FEED_CACHE_TTL_MS };

  return new Response(body, {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
