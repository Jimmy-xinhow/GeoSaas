const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  const res = await fetch(`${API_URL}/api/platform/llms.txt`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return new Response('# llms.txt temporarily unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const content = await res.text();
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
