import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

// AI crawler User-Agent patterns
const AI_BOT_PATTERNS = [
  { name: 'GPTBot', pattern: 'GPTBot' },
  { name: 'ChatGPT-User', pattern: 'ChatGPT-User' },
  { name: 'ClaudeBot', pattern: 'ClaudeBot' },
  { name: 'PerplexityBot', pattern: 'PerplexityBot' },
  { name: 'Google-Extended', pattern: 'Google-Extended' },
  { name: 'Googlebot', pattern: 'Googlebot' },
  { name: 'Bingbot', pattern: 'bingbot' },
  { name: 'CopilotBot', pattern: 'CopilotBot' },
  { name: 'Bytespider', pattern: 'Bytespider' },
  { name: 'Amazonbot', pattern: 'Amazonbot' },
  { name: 'YouBot', pattern: 'YouBot' },
  { name: 'CCBot', pattern: 'CCBot' },
  { name: 'FacebookBot', pattern: 'facebookexternalhit' },
  { name: 'Applebot', pattern: 'Applebot' },
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
      `<${SITE_URL}/feed>; rel="alternate"; type="application/rss+xml"; title="Geovault RSS"`,
      `<${SITE_URL}/feed.json>; rel="alternate"; type="application/feed+json"; title="Geovault JSON Feed"`,
    ].join(', '),
  );

  response.headers.set('X-Canonical-URL', `${SITE_URL}${pathname}`);

  // ─── Security headers ───
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'on');

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
