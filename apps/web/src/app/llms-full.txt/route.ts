export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  const res = await fetch(`${API_URL}/api/platform/llms-full.txt`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('# llms-full.txt temporarily unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const content = await res.text();
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=21600',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Version': new Date().toISOString(),
    },
  });
}
