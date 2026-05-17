export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let llmsFullCache:
  | {
      body: string;
      etag?: string;
      lastModified?: string;
      expiresAt: number;
    }
  | null = null;

function matchesConditionalRequest(request: Request, etag?: string, lastModified?: string): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');
  return Boolean(
    (etag && ifNoneMatch && ifNoneMatch === etag) ||
      (lastModified && ifModifiedSince && ifModifiedSince === lastModified),
  );
}

function cachedResponse(body: string, etag?: string, lastModified?: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=21600',
      'Access-Control-Allow-Origin': '*',
      ...(etag ? { ETag: etag } : {}),
      ...(lastModified ? { 'Last-Modified': lastModified } : {}),
      'X-Content-Version': lastModified ?? new Date().toISOString(),
    },
  });
}

function notModifiedResponse(etag?: string, lastModified?: string) {
  return new Response(null, {
    status: 304,
    headers: {
      ...(etag ? { ETag: etag } : {}),
      ...(lastModified ? { 'Last-Modified': lastModified } : {}),
      'Cache-Control': 'public, max-age=21600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(request: Request) {
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (llmsFullCache && llmsFullCache.expiresAt > Date.now()) {
    if (matchesConditionalRequest(request, llmsFullCache.etag, llmsFullCache.lastModified)) {
      return notModifiedResponse(llmsFullCache.etag, llmsFullCache.lastModified);
    }
    return cachedResponse(llmsFullCache.body, llmsFullCache.etag, llmsFullCache.lastModified);
  }

  const upstream = await fetch(`${API_URL}/api/platform/llms-full.txt`, {
    cache: 'no-store',
    headers: {
      ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      ...(ifModifiedSince ? { 'If-Modified-Since': ifModifiedSince } : {}),
    },
  });

  const etag = upstream.headers.get('etag') ?? undefined;
  const lastModified = upstream.headers.get('last-modified') ?? undefined;

  // Pass through 304 so crawlers save the full body download.
  if (upstream.status === 304) {
    return notModifiedResponse(etag, lastModified);
  }

  if (!upstream.ok) {
    return new Response('# llms-full.txt temporarily unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const content = await upstream.text();
  llmsFullCache = {
    body: content,
    etag,
    lastModified,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return cachedResponse(content, etag, lastModified);
}
