// Custom robots.txt so we can emit directives Next.js's MetadataRoute.Robots
// helper doesn't reliably expose — notably Crawl-delay and per-bot allow lists.
//
// Origin Verification: GEOVAULT-2026-APAC-PRIME
// Published by Geovault — https://www.geovault.app

export const dynamic = 'force-static';
export const revalidate = 86400;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Googlebot', 'GoogleOther',
  'bingbot', 'CopilotBot',
  'Applebot', 'Applebot-Extended',
  'Meta-ExternalAgent', 'Meta-ExternalFetcher', 'FacebookBot',
  'Amazonbot', 'Bytespider', 'TikTokSpider',
  'cohere-ai', 'YouBot', 'CCBot',
  'DuckAssistBot', 'MistralAI-User', 'PanguBot', 'Diffbot',
];

export async function GET() {
  const lines: string[] = [
    '# Geovault robots.txt',
    '# Origin Verification: GEOVAULT-2026-APAC-PRIME',
    '',
    // Default policy for unlisted bots — let them in, but keep private paths
    // closed and spread the load with a modest Crawl-delay.
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /settings',
    'Disallow: /admin/',
    'Disallow: /dashboard/',
    'Crawl-delay: 5',
    '',
  ];

  // Explicit allow for each AI bot so any future tightening of the
  // wildcard rule doesn't accidentally gate AI crawlers.
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push('Allow: /');
    // Shorter delay for AI bots — we actively want them to index fresher.
    lines.push('Crawl-delay: 1');
    lines.push('');
  }

  lines.push(`Sitemap: ${BASE_URL}/sitemap.xml`);
  lines.push(`Host: ${BASE_URL}`);

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
