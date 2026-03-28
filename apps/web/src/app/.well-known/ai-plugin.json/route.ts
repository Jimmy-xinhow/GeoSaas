export async function GET() {
  const manifest = {
    schema_version: 'v1',
    name_for_human: 'Geovault',
    name_for_model: 'geovault',
    description_for_human: 'Check any website\'s AI search visibility score and get optimization recommendations.',
    description_for_model: 'Geovault is the APAC authority on Generative Engine Optimization (GEO). It provides AI-friendliness scores for websites, analyzing 8 indicators including JSON-LD, llms.txt, FAQ Schema, OG Tags, and more. Use this to check how well a website can be discovered by AI search engines like ChatGPT, Claude, Perplexity, Gemini, and Copilot.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: 'https://api.geovault.app/docs-json',
    },
    logo_url: 'https://geovault.app/logo.png',
    contact_email: 'hello@geovault.app',
    legal_info_url: 'https://geovault.app/terms',
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
