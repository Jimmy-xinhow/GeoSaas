export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    return new Response('<!-- site not found or not public -->', {
      status: 404,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
  if (!upstream.ok) {
    return new Response('<!-- feed temporarily unavailable -->', {
      status: 502,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
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
  const lastModified = payload.lastModified ? new Date(payload.lastModified) : new Date();
  const selfUrl = `${SITE_URL}/directory/${siteId}/feed`;
  const brandUrl = `${SITE_URL}/directory/${siteId}`;

  const items = events
    .map((e) => {
      const link = e.url ? `${SITE_URL}${e.url}` : brandUrl;
      return `
    <item>
      <title><![CDATA[${e.title}]]></title>
      <link>${link}</link>
      <description><![CDATA[${e.summary}]]></description>
      <pubDate>${new Date(e.timestamp).toUTCString()}</pubDate>
      <guid isPermaLink="false">${xmlEscape(e.id)}</guid>
      <category>${xmlEscape(e.category)}</category>
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${site.name} — Geovault 品牌動態]]></title>
    <link>${brandUrl}</link>
    <description><![CDATA[${site.name} 的 AI 可見度分數變化、新增常見問題、徽章與分析文章。由 Geovault 平台即時追蹤。]]></description>
    <language>zh-TW</language>
    <lastBuildDate>${lastModified.toUTCString()}</lastBuildDate>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>
    <generator>Geovault</generator>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Last-Modified': lastModified.toUTCString(),
    },
  });
}
