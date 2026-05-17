export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const CACHE_TTL_MS = 60 * 60 * 1000;

let llmsSummaryCache:
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

function textResponse(body: string, etag?: string, lastModified?: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      ...(etag ? { ETag: etag } : {}),
      ...(lastModified ? { 'Last-Modified': lastModified } : {}),
    },
  });
}

function notModifiedResponse(etag?: string, lastModified?: string) {
  return new Response(null, {
    status: 304,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      ...(etag ? { ETag: etag } : {}),
      ...(lastModified ? { 'Last-Modified': lastModified } : {}),
    },
  });
}

export async function GET(request: Request) {
  if (llmsSummaryCache && llmsSummaryCache.expiresAt > Date.now()) {
    if (matchesConditionalRequest(request, llmsSummaryCache.etag, llmsSummaryCache.lastModified)) {
      return notModifiedResponse(llmsSummaryCache.etag, llmsSummaryCache.lastModified);
    }
    return textResponse(llmsSummaryCache.body, llmsSummaryCache.etag, llmsSummaryCache.lastModified);
  }

  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');
  const res = await fetch(`${API_URL}/api/platform/llms.txt`, {
    cache: 'no-store',
    headers: {
      ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      ...(ifModifiedSince ? { 'If-Modified-Since': ifModifiedSince } : {}),
    },
  });

  const etag = res.headers.get('etag') ?? undefined;
  const lastModified = res.headers.get('last-modified') ?? undefined;

  if (res.status === 304) {
    return notModifiedResponse(etag, lastModified);
  }

  if (!res.ok) {
    return new Response('# llms.txt temporarily unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const content = await res.text();
  llmsSummaryCache = {
    body: content,
    etag,
    lastModified,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return textResponse(content, etag, lastModified);
}
