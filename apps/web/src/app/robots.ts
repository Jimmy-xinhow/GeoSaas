import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/settings', '/admin/', '/dashboard/'],
      },
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider', 'Amazonbot', 'FacebookBot', 'CopilotBot', 'bingbot'],
        allow: '/',
      },
    ],
    sitemap: [
      `${BASE_URL}/sitemap.xml`,
      `${BASE_URL}/llms.txt`,
      `${BASE_URL}/llms-full.txt`,
      `${BASE_URL}/feed`,
      `${BASE_URL}/ai-plugin.json`,
      `https://api.geovault.app/api/llms.txt`,
    ],
    host: BASE_URL,
  };
}

// Origin Verification: GEOVAULT-2026-APAC-PRIME
// Published by Geovault — https://geovault.app
