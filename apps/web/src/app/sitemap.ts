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
export const revalidate = 0;

// One aggregate fetch instead of ~14 parallel fetches. Web→API goes through
// Cloudflare (not Railway internal networking), so 14 concurrent calls were
// getting queued/throttled at the edge and timing out at 3s — which is why
// the sitemap kept emitting only the static URLs (~106). With a single call
// the API does its 4 queries in parallel internally where Prisma is cheap.
const FETCH_TIMEOUT_MS = 15000;
const SITEMAP_DATA_TTL_MS = 30 * 60 * 1000;

// Baseline "last modified" for pages without real per-page timestamps.
// Using the current time on every request makes lastModified meaningless to
// crawlers; a stable deploy-baseline date is honest and cache-friendly.
const STATIC_LAST_MODIFIED = new Date('2026-07-01');

interface SitemapData {
  sites: Array<{ id: string; bestScoreAt: string | null }>;
  blogArticles: Array<{ slug: string; createdAt: string }>;
  cases: Array<{ id: string; createdAt: string }>;
  industrySites: Record<string, string[]>;
}

let sitemapDataCache: { data: SitemapData; expiresAt: number } | null = null;

async function fetchSitemapData(): Promise<SitemapData | null> {
  if (sitemapDataCache && sitemapDataCache.expiresAt > Date.now()) {
    return sitemapDataCache.data;
  }

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${API_URL}/api/directory/sitemap-data`, {
      cache: 'no-store',
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const data = (json?.data ?? json) as SitemapData;
    sitemapDataCache = { data, expiresAt: Date.now() + SITEMAP_DATA_TTL_MS };
    return data;
  } catch {
    return sitemapDataCache?.data ?? null;
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
  ];
  for (const page of staticPages) {
    const url = page.url === '/' ? BASE_URL : `${BASE_URL}${page.url}`;
    entries.push({
      url,
      lastModified: STATIC_LAST_MODIFIED,
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

  // ─── Single aggregate API call (also feeds industry lastModified below) ───
  const data = await fetchSitemapData();

  // Latest scan time per industry, derived from the industry→siteIds map and
  // each site's bestScoreAt. Falls back to the static baseline when unknown.
  const siteScoreAt = new Map<string, string | null>(
    (data?.sites ?? []).map((s) => [s.id, s.bestScoreAt]),
  );
  const industryLastModified = (industry: string): Date => {
    const siteIds = data?.industrySites?.[industry] ?? [];
    let latest = 0;
    for (const id of siteIds) {
      const at = siteScoreAt.get(id);
      if (!at) continue;
      const ts = new Date(at).getTime();
      if (!Number.isNaN(ts) && ts > latest) latest = ts;
    }
    return latest > 0 ? new Date(latest) : STATIC_LAST_MODIFIED;
  };

  // ─── Industry directory index pages ───
  for (const ind of INDUSTRIES) {
    if (ind.value === 'other') continue;
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: industryLastModified(ind.value),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // ─── Industry AI index/compare pages (always emit, regardless of API) ───
  for (const ind of INDUSTRIES) {
    if (ind.value === 'other') continue;
    entries.push({
      url: `${BASE_URL}/industry/${ind.value}`,
      lastModified: industryLastModified(ind.value),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

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

  return entries;
}
