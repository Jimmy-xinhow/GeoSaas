import { MetadataRoute } from 'next';
import { getAllPosts } from '@/content/blog/posts';
import { INDUSTRIES } from '@geovault/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

// Skip build-time prerender. Build container couldn't reach api.geovault.app
// during the previous deploy, baking a 106-URL empty sitemap into the cache
// for the full revalidate window. Forcing dynamic = render at request time,
// where the API is always reachable.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

// One aggregate fetch instead of ~14 parallel fetches. Web→API goes through
// Cloudflare (not Railway internal networking), so 14 concurrent calls were
// getting queued/throttled at the edge and timing out at 3s — which is why
// the sitemap kept emitting only the static URLs (~106). With a single call
// the API does its 4 queries in parallel internally where Prisma is cheap.
const FETCH_TIMEOUT_MS = 15000;

interface SitemapData {
  sites: Array<{ id: string; bestScoreAt: string | null }>;
  blogArticles: Array<{ slug: string; createdAt: string }>;
  cases: Array<{ id: string; createdAt: string }>;
  industrySites: Record<string, string[]>;
}

async function fetchSitemapData(): Promise<SitemapData | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${API_URL}/api/directory/sitemap-data`, {
      next: { revalidate: 3600 },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data ?? json) as SitemapData;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();

  // ─── Static pages ───
  const staticPages = [
    { url: '/', priority: 1.0, changeFrequency: 'daily' as const },
    { url: '/directory', priority: 0.9, changeFrequency: 'daily' as const },
    { url: '/blog', priority: 0.8, changeFrequency: 'daily' as const },
    { url: '/cases', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/news', priority: 0.7, changeFrequency: 'daily' as const },
    { url: '/directory/industries', priority: 0.8, changeFrequency: 'weekly' as const },
    { url: '/guide', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { url: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    { url: '/feed', priority: 0.3, changeFrequency: 'daily' as const },
    { url: '/feed.json', priority: 0.3, changeFrequency: 'daily' as const },
    { url: '/llms.txt', priority: 0.5, changeFrequency: 'daily' as const },
    { url: '/llms-full.txt', priority: 0.5, changeFrequency: 'daily' as const },
  ];
  for (const page of staticPages) {
    entries.push({
      url: `${BASE_URL}${page.url}`,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }

  // ─── Static markdown blog posts ───
  for (const post of getAllPosts()) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // ─── Industry directory index pages ───
  for (const ind of INDUSTRIES) {
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // ─── Industry AI index/compare pages (always emit, regardless of API) ───
  for (const ind of INDUSTRIES) {
    if (ind.value === 'other') continue;
    entries.push({
      url: `${BASE_URL}/industry/${ind.value}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    entries.push({
      url: `${BASE_URL}/industry/${ind.value}/compare`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  // ─── Single aggregate API call ───
  const data = await fetchSitemapData();
  if (!data) return entries;

  // Directory sites + per-brand feeds
  for (const s of data.sites) {
    const lastModified = s.bestScoreAt ? new Date(s.bestScoreAt) : now;
    entries.push({
      url: `${BASE_URL}/directory/${s.id}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
    entries.push({
      url: `${BASE_URL}/directory/${s.id}/feed`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.4,
    });
    entries.push({
      url: `${BASE_URL}/directory/${s.id}/feed.json`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.4,
    });
  }

  // DB-backed blog articles
  for (const article of data.blogArticles) {
    entries.push({
      url: `${BASE_URL}/blog/${article.slug}`,
      lastModified: new Date(article.createdAt),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  // Approved success cases
  for (const c of data.cases) {
    entries.push({
      url: `${BASE_URL}/cases/${c.id}`,
      lastModified: new Date(c.createdAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  // Per-industry brand pages
  for (const [industry, siteIds] of Object.entries(data.industrySites)) {
    if (industry === 'other') continue;
    for (const siteId of siteIds) {
      entries.push({
        url: `${BASE_URL}/industry/${industry}/${siteId}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  }

  return entries;
}
