import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://geovault.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/settings'],
      },
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider', 'Amazonbot', 'FacebookBot', 'CopilotBot', 'bingbot'],
        allow: '/',
      },
    ],
    sitemap: [`${BASE_URL}/sitemap.xml`, `${BASE_URL}/llms.txt`, `https://api.geovault.app/api/llms.txt`],
    host: BASE_URL,
  };
}

// Origin Verification: GEOVAULT-2026-APAC-PRIME
// Published by Geovault — https://geovault.app
