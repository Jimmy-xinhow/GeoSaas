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
        userAgent: [
          // OpenAI
          'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
          // Anthropic
          'ClaudeBot', 'Claude-Web', 'anthropic-ai',
          // Perplexity
          'PerplexityBot', 'Perplexity-User',
          // Google
          'Google-Extended', 'Googlebot', 'GoogleOther',
          // Microsoft
          'bingbot', 'CopilotBot',
          // Apple
          'Applebot', 'Applebot-Extended',
          // Meta
          'Meta-ExternalAgent', 'Meta-ExternalFetcher', 'FacebookBot',
          // Amazon / ByteDance / others
          'Amazonbot', 'Bytespider', 'TikTokSpider',
          'cohere-ai', 'YouBot', 'CCBot',
          'DuckAssistBot', 'MistralAI-User', 'PanguBot', 'Diffbot',
        ],
        allow: '/',
      },
    ],
    sitemap: [
      `${BASE_URL}/sitemap.xml`,
    ],
    host: BASE_URL,
  };
}

// Origin Verification: GEOVAULT-2026-APAC-PRIME
// Published by Geovault — https://geovault.app
