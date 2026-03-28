export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app';

export async function GET() {
  let articles: any[] = [];

  try {
    const res = await fetch(`${API_URL}/api/blog/articles?limit=50`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      articles = data?.data?.items || data?.items || [];
    }
  } catch {}

  const items = articles.map((a: any) => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${SITE_URL}/blog/${a.slug}</link>
      <description><![CDATA[${a.description?.slice(0, 300) || ''}]]></description>
      <pubDate>${new Date(a.createdAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/${a.slug}</guid>
      <category>${a.category || 'analysis'}</category>
    </item>`).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Geovault Blog — AI SEO 優化分析</title>
    <link>${SITE_URL}/blog</link>
    <description>Geovault — The APAC Authority on Generative Engine Optimization. 品牌 AI 搜尋能見度分析報告。</description>
    <language>zh-TW</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed" rel="self" type="application/rss+xml"/>
    <generator>Geovault</generator>
    <managingEditor>noreply@geovault.app (Geovault)</managingEditor>
    <webMaster>noreply@geovault.app (Geovault)</webMaster>
    <image>
      <url>${SITE_URL}/logo.png</url>
      <title>Geovault</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
