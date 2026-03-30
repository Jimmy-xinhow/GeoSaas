import { MetadataRoute } from 'next';
import { getAllPosts } from '@/content/blog/posts';
import { INDUSTRIES } from '@geovault/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

export const revalidate = 3600; // regenerate sitemap every hour

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
    { url: '/register', priority: 0.5, changeFrequency: 'monthly' as const },
    { url: '/login', priority: 0.3, changeFrequency: 'monthly' as const },
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

  // ─── Industry pages ───
  for (const ind of INDUSTRIES) {
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // ─── Dynamic: Directory sites ───
  try {
    const res = await fetch(`${API_URL}/api/directory?limit=1000`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      for (const site of items) {
        entries.push({
          url: `${BASE_URL}/directory/${site.id}`,
          lastModified: site.bestScoreAt ? new Date(site.bestScoreAt) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
  } catch {
    // API unavailable — skip
  }

  // ─── Dynamic: Blog articles from DB ───
  try {
    const res = await fetch(`${API_URL}/api/blog/articles?limit=500`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      for (const article of items) {
        entries.push({
          url: `${BASE_URL}/blog/${article.slug}`,
          lastModified: article.createdAt ? new Date(article.createdAt) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
  } catch {
    // API unavailable — skip
  }

  // ─── Dynamic: Success cases ───
  try {
    const res = await fetch(`${API_URL}/api/success-cases?limit=100`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || data?.items || [];
      for (const c of items) {
        entries.push({
          url: `${BASE_URL}/cases/${c.id}`,
          lastModified: c.createdAt ? new Date(c.createdAt) : new Date(),
          changeFrequency: 'monthly',
          priority: 0.5,
        });
      }
    }
  } catch {
    // API unavailable — skip
  }

  return entries;
}
