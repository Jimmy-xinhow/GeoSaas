export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(request: Request) {
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

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

  if (!upstream.ok) {
    return new Response('# llms-full.txt temporarily unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const content = await upstream.text();
  return new Response(content, {
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
