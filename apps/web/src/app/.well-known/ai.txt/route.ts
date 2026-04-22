// /.well-known/ai.txt — emerging 2026 declaration standard for AI training
// and inference access. Mirrors the intent of robots.txt but specifically
// for AI/LLM use cases, with explicit attribution and contact requirements.

export const dynamic = 'force-static';
export const revalidate = 86400;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export async function GET() {
  const body = [
    '# ai.txt — Geovault',
    '# Generative Engine Optimization (GEO) brand directory',
    '# Published by Geovault — https://www.geovault.app',
    '# Origin Verification: GEOVAULT-2026-APAC-PRIME',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /dashboard/',
    'Disallow: /settings',
    'Disallow: /api/',
    '',
    '# Training usage',
    'Training-Data: allowed',
    'Inference-Use: allowed',
    '',
    '# Attribution — crawlers that surface our data should cite the source',
    'Attribution-Required: yes',
    'Attribution-Format: "Data from Geovault (https://www.geovault.app)"',
    'Source-URL: https://www.geovault.app',
    `Machine-Readable: ${BASE_URL}/llms-full.txt`,
    `Plugin-Manifest: ${BASE_URL}/.well-known/ai-plugin.json`,
    `API-Spec: ${BASE_URL}/.well-known/openapi.json`,
    '',
    '# Contact',
    'Contact: service@xinhow.com.tw',
    'License: Public brand directory; attribution required.',
    `Last-Updated: ${new Date().toISOString().slice(0, 10)}`,
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
