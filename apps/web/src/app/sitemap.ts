import { MetadataRoute } from 'next';
import { getAllPosts } from '@/content/blog/posts';
import { INDUSTRIES } from '@geovault/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

export const revalidate = 3600; // regenerate sitemap every hour

// Per-fetch timeout. Without this, a single hung API request can stall the
// entire sitemap response and cause Google Search Console to report
// "couldn't fetch" — that was the symptom this rewrite addresses.
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

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
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }

  // ─── Static blog posts ───
  const posts = getAllPosts();
  for (const post of posts) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // ─── Industry index pages (static) ───
  for (const ind of INDUSTRIES) {
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // ─── Dynamic fetches: run all in parallel with bounded concurrency ───
  // We previously did these sequentially (~64 round-trips), which routinely
  // timed out the sitemap and caused GSC "couldn't fetch". Now we issue them
  // in parallel and cap directory pagination at 10 pages (500 sites).
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  const directoryUrls = Array.from(
    { length: MAX_PAGES },
    (_, i) => `${API_URL}/api/directory?limit=${PAGE_SIZE}&page=${i + 1}`,
  );

  const industryAiUrls = INDUSTRIES
    .filter((ind) => ind.value !== 'other')
    .map((ind) => ({
      industry: ind.value,
      url: `${API_URL}/api/industry-ai/${ind.value}/sites`,
    }));

  const [directoryResults, blogData, casesData, industryAiResults] = await Promise.all([
    Promise.all(directoryUrls.map((u) => fetchJson(u))),
    fetchJson(`${API_URL}/api/blog/articles?limit=500`),
    fetchJson(`${API_URL}/api/success-cases?limit=100`),
    Promise.all(industryAiUrls.map(async (e) => ({ industry: e.industry, data: await fetchJson(e.url) }))),
  ]);

  // ─── Directory sites + per-brand feeds ───
  for (const data of directoryResults) {
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

  // ─── Blog articles from DB ───
  if (blogData) {
    const items = blogData?.data?.items || blogData?.items || [];
    for (const article of items) {
      entries.push({
        url: `${BASE_URL}/blog/${article.slug}`,
        lastModified: article.createdAt ? new Date(article.createdAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  }

  // ─── Success cases ───
  if (casesData) {
    const items = casesData?.data?.items || casesData?.items || [];
    for (const c of items) {
      entries.push({
        url: `${BASE_URL}/cases/${c.id}`,
        lastModified: c.createdAt ? new Date(c.createdAt) : new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  }

  // ─── Industry AI recommendation pages ───
  for (const { industry, data } of industryAiResults) {
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
