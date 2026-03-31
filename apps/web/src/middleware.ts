import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add Link headers pointing AI crawlers to machine-readable resources
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

  // Add canonical URL
  const pathname = request.nextUrl.pathname;
  response.headers.set('X-Canonical-URL', `${SITE_URL}${pathname}`);

  return response;
}

// Only apply to public pages, not API or static files
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon|logos|icon).*)',
  ],
};
