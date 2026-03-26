import { MetadataRoute } from 'next';
import { getAllPosts } from '@/content/blog/posts';
import { INDUSTRIES } from '@geo-saas/shared';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geo-saas.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages
  const staticPages = [
    { url: '/', priority: 1.0, changeFrequency: 'daily' as const },
    { url: '/login', priority: 0.3, changeFrequency: 'monthly' as const },
    { url: '/register', priority: 0.5, changeFrequency: 'monthly' as const },
    { url: '/directory', priority: 0.9, changeFrequency: 'daily' as const },
    { url: '/blog', priority: 0.8, changeFrequency: 'weekly' as const },
  ];

  for (const page of staticPages) {
    entries.push({
      url: `${BASE_URL}${page.url}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }

  // Blog posts
  const posts = getAllPosts();
  for (const post of posts) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // Industry pages
  for (const ind of INDUSTRIES) {
    entries.push({
      url: `${BASE_URL}/directory/industry/${ind.value}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // News page
  entries.push({
    url: `${BASE_URL}/news`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.7,
  });

  // Directory sites (fetch from API)
  try {
    const res = await fetch(`${API_URL}/api/directory?limit=500`, {
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
    // API unavailable during build — skip directory entries
  }

  return entries;
}
