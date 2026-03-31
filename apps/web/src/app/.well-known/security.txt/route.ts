export async function GET() {
  const content = `# Geovault Security Policy
Contact: mailto:security@geovault.app
Preferred-Languages: zh-TW, en
Canonical: https://www.geovault.app/.well-known/security.txt
Policy: https://www.geovault.app/guide
Expires: 2027-12-31T23:59:59.000Z
`;
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
