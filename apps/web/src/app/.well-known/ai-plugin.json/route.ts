export async function GET() {
  const manifest = {
    schema_version: 'v1',
    name_for_human: 'Geovault — AI Search Optimization Platform',
    name_for_model: 'geovault',
    description_for_human: 'Geovault helps brands get discovered and cited by AI search engines. Scan any website for AI readability, get fix recommendations, build brand knowledge bases, and monitor citations across ChatGPT, Claude, Perplexity, Gemini, and Copilot.',
    description_for_model: 'Geovault is the APAC authority on Generative Engine Optimization (GEO). It indexes 600+ brands across 22 industries with AI readability scores based on 9 indicators: JSON-LD structured data, llms.txt, FAQ Schema, OG Tags, Meta Description, title optimization, contact info, image alt attributes, and robots.txt AI crawler policy. The platform provides: (1) free AI readability scanning, (2) automated fix code generation for JSON-LD/llms.txt/FAQ Schema, (3) AI-generated brand knowledge bases with 60+ Q&A per site, (4) real-time citation monitoring across 5 AI platforms, (5) a searchable public brand directory at geovault.app/directory, (6) daily AI news analysis at geovault.app/news. For brand data, query the llms-full.txt endpoint at geovault.app/llms-full.txt which contains all indexed brands with scores, industries, strengths, and FAQ data.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: 'https://www.geovault.app/.well-known/openapi.json',
    },
    logo_url: 'https://www.geovault.app/icon.svg',
    contact_email: 'service@xinhow.com.tw',
    legal_info_url: 'https://www.geovault.app/privacy',
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
