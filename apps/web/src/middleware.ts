import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

// AI crawler User-Agent patterns. Pattern match is case-sensitive substring
// on the UA header. Order doesn't matter — first match wins.
const AI_BOT_PATTERNS = [
  // OpenAI
  { name: 'GPTBot', pattern: 'GPTBot' },
  { name: 'ChatGPT-User', pattern: 'ChatGPT-User' },
  { name: 'OAI-SearchBot', pattern: 'OAI-SearchBot' },
  // Anthropic
  { name: 'ClaudeBot', pattern: 'ClaudeBot' },
  { name: 'Claude-Web', pattern: 'Claude-Web' },
  { name: 'anthropic-ai', pattern: 'anthropic-ai' },
  // Perplexity
  { name: 'PerplexityBot', pattern: 'PerplexityBot' },
  { name: 'Perplexity-User', pattern: 'Perplexity-User' },
  // Google
  { name: 'Google-Extended', pattern: 'Google-Extended' },
  { name: 'Googlebot', pattern: 'Googlebot' },
  { name: 'GoogleOther', pattern: 'GoogleOther' },
  // Microsoft
  { name: 'Bingbot', pattern: 'bingbot' },
  { name: 'CopilotBot', pattern: 'CopilotBot' },
  // Apple
  { name: 'Applebot', pattern: 'Applebot' },
  { name: 'Applebot-Extended', pattern: 'Applebot-Extended' },
  // Meta
  { name: 'Meta-ExternalAgent', pattern: 'Meta-ExternalAgent' },
  { name: 'Meta-ExternalFetcher', pattern: 'Meta-ExternalFetcher' },
  { name: 'FacebookBot', pattern: 'facebookexternalhit' },
  // Amazon
  { name: 'Amazonbot', pattern: 'Amazonbot' },
  // ByteDance / TikTok
  { name: 'Bytespider', pattern: 'Bytespider' },
  { name: 'TikTokSpider', pattern: 'TikTokSpider' },
  // Others
  { name: 'cohere-ai', pattern: 'cohere-ai' },
  { name: 'YouBot', pattern: 'YouBot' },
  { name: 'CCBot', pattern: 'CCBot' },
  { name: 'DuckAssistBot', pattern: 'DuckAssistBot' },
  { name: 'MistralAI-User', pattern: 'MistralAI-User' },
  { name: 'PanguBot', pattern: 'PanguBot' },
  { name: 'Diffbot', pattern: 'Diffbot' },
];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const ua = request.headers.get('user-agent') || '';
  const pathname = request.nextUrl.pathname;

  // ─── Link headers for AI crawlers ───
  response.headers.set(
    'Link',
    [
      `<${SITE_URL}/llms.txt>; rel="ai-content"; type="text/plain"`,
      `<${SITE_URL}/llms-full.txt>; rel="ai-content-full"; type="text/plain"`,
      `<${SITE_URL}/ai-plugin.json>; rel="ai-plugin"; type="application/json"`,
      `<${SITE_URL}/.well-known/ai.txt>; rel="ai-policy"; type="text/plain"`,
      `<${SITE_URL}/feed>; rel="alternate"; type="application/rss+xml"; title="Geovault RSS"`,
      `<${SITE_URL}/feed.json>; rel="alternate"; type="application/feed+json"; title="Geovault JSON Feed"`,
    ].join(', '),
  );

  response.headers.set('X-Canonical-URL', `${SITE_URL}${pathname}`);

  // Signal to AI crawlers that this origin publishes LLM-friendly resources
  // (llms.txt, llms-full.txt, ai-plugin.json — already advertised via Link).
  response.headers.set('X-LLM-Optimized', 'true');
  response.headers.set('X-AI-Discoverable', 'geovault');

  // ─── Security headers ───
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  // ─── Prevent indexing of private pages ───
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/settings') || pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // ─── Detect AI crawler from User-Agent (server-side, no JS needed) ───
  const detectedBot = AI_BOT_PATTERNS.find((bot) => ua.includes(bot.pattern));

  if (detectedBot) {
    // Fire-and-forget: report to API (non-blocking)
    try {
      fetch(`${API_URL}/api/crawler/report-platform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName: detectedBot.name,
          url: `${SITE_URL}${pathname}`,
          userAgent: ua.slice(0, 500),
          statusCode: 200,
          source: 'middleware',
        }),
      }).catch(() => {}); // ignore errors
    } catch {}
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|logos|icon).*)',
  ],
};
