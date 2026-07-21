import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { AI_BOTS } from '@geovault/shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';

// More-specific patterns first so Claude-SearchBot wins over ClaudeBot.
const AI_BOT_PATTERNS = [...AI_BOTS].sort((a, b) => b.uaPattern.length - a.uaPattern.length);
const GONE_PATHS = new Set([
  '/blog/cmn908gxe0-202604-sat-data-pulse-icfq',
]);
const STATIC_BLOG_SLUGS = new Set([
  'what-is-geo',
  'llms-txt-guide',
  'json-ld-for-ai',
  'ai-crawler-tracking',
  'geo-vs-seo',
]);
const LEGACY_PUBLIC_REDIRECTS = new Map<string, string>([
  ['/about', '/'],
  ['/contact', '/'],
  ['/en', '/'],
  ['/ja', '/'],
  ['/products', '/guide'],
  ['/services', '/guide'],
  ['/%E6%9C%88', '/'],
  ['/月', '/'],
]);
function publicNotFoundResponse(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function getMissingPublicBlogResponse(pathname: string): Promise<NextResponse | null> {
  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(slug);
    } catch {
      return publicNotFoundResponse();
    }
    if (STATIC_BLOG_SLUGS.has(decodedSlug)) {
      return null;
    }

    try {
      const res = await fetch(`${API_URL}/api/blog/articles/${encodeURIComponent(decodedSlug)}`, {
        cache: 'no-store',
      });
      return res.status === 404 ? publicNotFoundResponse() : null;
    } catch {
      return null;
    }
  }

  return null;
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.hostname === 'geovault.app') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.geovault.app';
    return NextResponse.redirect(url, 301);
  }

  const response = NextResponse.next();
  const ua = request.headers.get('user-agent') || '';
  const pathname = request.nextUrl.pathname;
  const legacyDestination = LEGACY_PUBLIC_REDIRECTS.get(pathname);
  if (legacyDestination) {
    const url = request.nextUrl.clone();
    url.pathname = legacyDestination;
    url.search = '';
    return NextResponse.redirect(url, 301);
  }

  if (GONE_PATHS.has(pathname)) {
    return new NextResponse('Gone', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, follow',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const missingBlogResponse = await getMissingPublicBlogResponse(pathname);
  if (missingBlogResponse) {
    return missingBlogResponse;
  }

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
  const PRIVATE_PREFIXES = [
    '/admin', '/dashboard', '/settings',
    '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
    '/sites', '/monitor', '/content', '/publish', '/playbook',
    '/affiliate', '/brand-spread', '/published-content', '/support',
  ];
  if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // ─── Detect AI crawler from User-Agent (server-side, no JS needed) ───
  if (
    pathname === '/feed' ||
    pathname === '/feed.json' ||
    /^\/directory\/[^/]+\/feed(?:\.json)?$/.test(pathname) ||
    /^\/industry\/[^/]+\/compare$/.test(pathname) ||
    /^\/industry\/[^/]+\/[^/]+$/.test(pathname)
  ) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }

  const detectedBot = AI_BOT_PATTERNS.find((bot) => ua.includes(bot.uaPattern));

  if (detectedBot) {
    // Keep the response non-blocking, but bind the report to the middleware
    // lifecycle so Edge/Next runtimes do not cancel it before it reaches API.
    try {
      event.waitUntil(fetch(`${API_URL}/api/crawler/report-platform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botName: detectedBot.name,
          botCategory: detectedBot.category,
          url: `${SITE_URL}${pathname}`,
          userAgent: ua.slice(0, 500),
          statusCode: 200,
          source: 'middleware',
        }),
      }).catch(() => {}));
    } catch {}
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|logos|icon).*)',
  ],
};
