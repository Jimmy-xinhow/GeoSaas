import { MetadataRoute } from 'next';
import { getAllPosts } from '@/content/blog/posts';
import { INDUSTRIES } from '@geovault/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

export const revalidate = 3600;

const FETCH_TIMEOUT_MS = 5000;

async function fetchJson<T = any>(url: string): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Sitemap index ─────────────────────────────────────────────────────────
// Next.js 14 requires `id` to be a *number* — string IDs silently produce 404
// for the resulting /sitemap/{id}.xml routes (this bit us once already).
//
// Shard plan (id → contents):
//   0 — static    fully static, never touches the API
//   1 — directory public brand pages + per-brand feeds
//   2 — blog      DB-backed blog articles
//   3 — cases     approved success cases
//   4 — industry  industry AI recommendation pages
const SHARDS = ['static', 'directory', 'blog', 'cases', 'industry'] as const;

export async function generateSitemaps() {
  return SHARDS.map((_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  switch (id) {
    case 0:
      return staticShard();
    case 1:
      return directoryShard();
    case 2:
      return blogShard();
    case 3:
      return casesShard();
    case 4:
      return industryShard();
    default:
      return [];
  }
}

// ─── Shard 0: static ───────────────────────────────────────────────────────
function staticShard(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

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
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }

  for (const post of getAllPosts()) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  for (const ind of INDUSTRIES) {
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  return entries;
}

// ─── Shard 1: directory ────────────────────────────────────────────────────
async function directoryShard(): Promise<MetadataRoute.Sitemap> {
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  const urls = Array.from(
    { length: MAX_PAGES },
    (_, i) => `${API_URL}/api/directory?limit=${PAGE_SIZE}&page=${i + 1}`,
  );
  const results = await Promise.all(urls.map((u) => fetchJson(u)));

  const entries: MetadataRoute.Sitemap = [];
  for (const data of results) {
    if (!data) continue;
    const items = data?.data?.items || data?.items || [];
    for (const site of items) {
      const lastModified = site.bestScoreAt ? new Date(site.bestScoreAt) : new Date();
      entries.push({
        url: `${BASE_URL}/directory/${site.id}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
      entries.push({
        url: `${BASE_URL}/directory/${site.id}/feed`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.4,
      });
      entries.push({
        url: `${BASE_URL}/directory/${site.id}/feed.json`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.4,
      });
    }
  }
  return entries;
}

// ─── Shard 2: blog ─────────────────────────────────────────────────────────
async function blogShard(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchJson(`${API_URL}/api/blog/articles?limit=500`);
  if (!data) return [];
  const items = data?.data?.items || data?.items || [];
  return items.map((article: any) => ({
    url: `${BASE_URL}/blog/${article.slug}`,
    lastModified: article.createdAt ? new Date(article.createdAt) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));
}

// ─── Shard 3: cases ────────────────────────────────────────────────────────
async function casesShard(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchJson(`${API_URL}/api/success-cases?limit=100`);
  if (!data) return [];
  const items = data?.data?.items || data?.items || [];
  return items.map((c: any) => ({
    url: `${BASE_URL}/cases/${c.id}`,
    lastModified: c.createdAt ? new Date(c.createdAt) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));
}

// ─── Shard 4: industry ─────────────────────────────────────────────────────
async function industryShard(): Promise<MetadataRoute.Sitemap> {
  const targets = INDUSTRIES.filter((ind) => ind.value !== 'other');
  const fetched = await Promise.all(
    targets.map(async (ind) => ({
      industry: ind.value,
      data: await fetchJson(`${API_URL}/api/industry-ai/${ind.value}/sites`),
    })),
  );

  const entries: MetadataRoute.Sitemap = [];
  for (const { industry, data } of fetched) {
    entries.push({
      url: `${BASE_URL}/industry/${industry}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    entries.push({
      url: `${BASE_URL}/industry/${industry}/compare`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
    if (!data) continue;
    const items = data?.data || data || [];
    if (!Array.isArray(items)) continue;
    for (const site of items) {
      entries.push({
        url: `${BASE_URL}/industry/${industry}/${site.id}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  }
  return entries;
}
