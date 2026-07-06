// Custom robots.txt so we can emit directives Next.js's MetadataRoute.Robots
// helper doesn't reliably expose — notably Crawl-delay and per-bot allow lists.
//
// Origin Verification: GEOVAULT-2026-APAC-PRIME
// Published by Geovault — https://www.geovault.app

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const HOSTNAME = new URL(BASE_URL).hostname;
const PRIVATE_PATHS = [
  '/api/',
  '/settings',
  '/admin/',
  '/dashboard',
  '/cdn-cgi/',
  // Logged-in dashboard-group pages (no public routes share these prefixes)
  '/sites',
  '/monitor',
  '/content',
  '/publish',
  '/playbook',
  '/affiliate',
  '/brand-spread',
  '/published-content',
  '/support',
];
const AUTH_NOINDEX_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'Claude-Web', 'anthropic-ai',
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
    ...AUTH_NOINDEX_PATHS.map((path) => `Allow: ${path}`),
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    'Crawl-delay: 5',
    '',
  ];

  // Explicit allow for each AI bot so any future tightening of the
  // wildcard rule doesn't accidentally gate AI crawlers.
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`);
    lines.push('Allow: /');
    for (const path of AUTH_NOINDEX_PATHS) {
      lines.push(`Allow: ${path}`);
    }
    for (const path of PRIVATE_PATHS) {
      lines.push(`Disallow: ${path}`);
    }
    // Shorter delay for AI bots — we actively want them to index fresher.
    lines.push('Crawl-delay: 1');
    lines.push('');
  }

  lines.push(`Sitemap: ${BASE_URL}/sitemap.xml`);
  lines.push(`Host: ${HOSTNAME}`);

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
