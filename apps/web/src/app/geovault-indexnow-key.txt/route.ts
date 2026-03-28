export async function GET() {
  return new Response('geovault-indexnow-key', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
