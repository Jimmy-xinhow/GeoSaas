export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;

  const upstream = await fetch(
    `${API_URL}/api/directory/${siteId}/feed-events?limit=50`,
    { cache: 'no-store' },
  );

  if (upstream.status === 404) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const data = await upstream.json();
  const payload = data?.data ?? data;
  const site = payload.site as { id: string; name: string; url: string; industry?: string; bestScore?: number };
  const events = (payload.events ?? []) as Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    url?: string;
    timestamp: string;
    category: string;
  }>;
  const lastModified = payload.lastModified
    ? new Date(payload.lastModified).toUTCString()
    : new Date().toUTCString();
  const brandUrl = `${SITE_URL}/directory/${siteId}`;

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${site.name} — Geovault 品牌動態`,
    home_page_url: brandUrl,
    feed_url: `${SITE_URL}/directory/${siteId}/feed.json`,
    description: `${site.name} 的 AI 可見度更新、常見問題、徽章與分析文章`,
    language: 'zh-TW',
    authors: [{ name: 'Geovault', url: SITE_URL }],
    hubs: [{ type: 'WebSub', url: 'https://pubsubhubbub.appspot.com/' }],
    items: events.map((e) => ({
      id: e.id,
      url: e.url ? `${SITE_URL}${e.url}` : brandUrl,
      title: e.title,
      content_text: e.summary,
      date_published: new Date(e.timestamp).toISOString(),
      tags: [e.category, e.type],
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Last-Modified': lastModified,
    },
  });
}
