export async function GET() {
  const xml = `<?xml version="1.0"?>
<users>
	<user>69F7520D35AA9402F35AFCEB0FF93397</user>
</users>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
