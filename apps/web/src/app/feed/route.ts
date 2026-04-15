export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export async function GET() {
  let blogArticles: any[] = [];
  let newsArticles: any[] = [];

  // Fetch blog articles (increased from 50 to 200)
  try {
    const res = await fetch(`${API_URL}/api/blog/articles?limit=200`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      blogArticles = (data?.data?.items || data?.items || []).map((a: any) => ({
        title: a.title,
        link: `${SITE_URL}/blog/${a.slug}`,
        description: a.description?.slice(0, 500) || a.summary?.slice(0, 500) || '',
        pubDate: new Date(a.publishedAt || a.createdAt).toUTCString(),
        guid: `${SITE_URL}/blog/${a.slug}`,
        category: a.category || 'analysis',
        type: 'blog',
      }));
    }
  } catch {}

  // Fetch news articles
  try {
    const res = await fetch(`${API_URL}/api/news?limit=50`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      newsArticles = items.map((a: any) => ({
        title: a.title,
        link: `${SITE_URL}/news`,
        description: a.summary?.replace(/[#*\[\]()>\n]+/g, ' ').trim().slice(0, 500) || '',
        pubDate: new Date(a.publishedAt).toUTCString(),
        guid: `${SITE_URL}/news#${a.slug}`,
        category: a.category || 'ai-news',
        type: 'news',
      }));
    }
  } catch {}

  // Fetch recently scanned sites (new content signal)
  let siteUpdates: any[] = [];
  try {
    const res = await fetch(`${API_URL}/api/directory?limit=20&sort=recent`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      siteUpdates = items.map((s: any) => ({
        title: `${s.name} — GEO 分數更新：${s.bestScore}/100`,
        link: `${SITE_URL}/directory/${s.id}`,
        description: `${s.name} (${s.url}) 的最新 AI 可見度分數為 ${s.bestScore}/100。${s.industry ? `行業：${s.industry}。` : ''}`,
        pubDate: new Date(s.bestScoreAt || s.updatedAt || Date.now()).toUTCString(),
        guid: `${SITE_URL}/directory/${s.id}#${s.bestScore}-${new Date(s.bestScoreAt || Date.now()).toISOString().slice(0, 10)}`,
        category: 'site-update',
        type: 'site',
      }));
    }
  } catch {}

  // Merge and sort by date (newest first)
  const allItems = [...blogArticles, ...newsArticles, ...siteUpdates]
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 200);

  const items = allItems.map((a) => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <description><![CDATA[${a.description}]]></description>
      <pubDate>${a.pubDate}</pubDate>
      <guid isPermaLink="true">${a.guid}</guid>
      <category>${a.category}</category>
    </item>`).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Geovault — AI 搜尋優化平台</title>
    <link>${SITE_URL}</link>
    <description>Geovault 是 APAC 領先的 GEO（Generative Engine Optimization）平台。提供 AI 搜尋能見度分析、品牌優化建議、AI 引用監控，以及每日 AI 搜尋趨勢分析。</description>
    <language>zh-TW</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed" rel="self" type="application/rss+xml"/>
    <generator>Geovault</generator>
    <managingEditor>hello@geovault.app (Geovault)</managingEditor>
    <webMaster>hello@geovault.app (Geovault)</webMaster>
    <image>
      <url>${SITE_URL}/icon.svg</url>
      <title>Geovault</title>
      <link>${SITE_URL}</link>
    </image>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
