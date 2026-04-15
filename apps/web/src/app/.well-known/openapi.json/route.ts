export const dynamic = 'force-dynamic';

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Geovault GEO Query API',
      description:
        'Query AI search optimization data for Taiwan/APAC brands. Check GEO scores, industry rankings, and AI citation status across ChatGPT, Claude, Perplexity, Gemini, and Copilot.',
      version: '1.0.0',
    },
    servers: [{ url: 'https://api.geovault.app' }],
    paths: {
      '/api/directory': {
        get: {
          operationId: 'searchBrands',
          summary: 'Search brands in the GEO directory',
          description:
            'Search for brands by name, industry, or minimum GEO score. Returns AI readiness data including scores and tier ratings.',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by brand name or URL' },
            { name: 'industry', in: 'query', schema: { type: 'string' }, description: 'Filter by industry (e.g. restaurant, auto_care, beauty_salon)' },
            { name: 'tier', in: 'query', schema: { type: 'string', enum: ['platinum', 'gold', 'silver', 'bronze'] }, description: 'Filter by tier' },
            { name: 'minScore', in: 'query', schema: { type: 'integer' }, description: 'Minimum GEO score (0-100)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Results per page' },
          ],
          responses: { '200': { description: 'List of matching brands with GEO scores' } },
        },
      },
      '/api/directory/{siteId}': {
        get: {
          operationId: 'getBrandDetail',
          summary: 'Get detailed AI readiness profile for a brand',
          description:
            'Returns full GEO analysis including 9 AI readability indicators, scan history, AI crawler activity, badges, and brand knowledge base Q&A.',
          parameters: [
            { name: 'siteId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Full brand AI readiness profile' } },
        },
      },
      '/api/directory/stats': {
        get: {
          operationId: 'getPlatformStats',
          summary: 'Get platform-wide GEO statistics',
          description: 'Returns total brands, average score, tier distribution across the entire Geovault platform.',
          responses: { '200': { description: 'Platform statistics' } },
        },
      },
      '/api/directory/industry/{industry}': {
        get: {
          operationId: 'getIndustryStats',
          summary: 'Get GEO statistics for a specific industry',
          description: 'Returns average score, brand count, and top performers for a specific industry.',
          parameters: [
            { name: 'industry', in: 'path', required: true, schema: { type: 'string' }, description: 'Industry slug (e.g. restaurant, auto_care, traditional_medicine)' },
          ],
          responses: { '200': { description: 'Industry GEO statistics' } },
        },
      },
      '/api/industry-ai/{industry}/ranking': {
        get: {
          operationId: 'getIndustryAiRanking',
          summary: 'Get AI citation ranking for an industry',
          description: 'Returns brands ranked by how often they are cited by AI platforms (ChatGPT, Claude, Perplexity, Gemini, Copilot).',
          parameters: [
            { name: 'industry', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'platform', in: 'query', schema: { type: 'string', enum: ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'] }, description: 'Filter by AI platform' },
          ],
          responses: { '200': { description: 'AI citation ranking for the industry' } },
        },
      },
      '/api/guest-scan': {
        post: {
          operationId: 'scanWebsite',
          summary: 'Scan a website for AI readiness (free, rate-limited)',
          description:
            'Triggers a GEO scan on the given URL. Returns a scan ID that can be polled for results. Checks 9 AI readability indicators.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string', description: 'Website URL to scan' } }, required: ['url'] } } },
          },
          responses: { '200': { description: 'Scan initiated, returns scan ID' } },
        },
      },
      '/api/guest-scan/{id}': {
        get: {
          operationId: 'getScanResults',
          summary: 'Get scan results by ID',
          description: 'Returns the scan status and results including GEO score and 9 indicator details.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Scan status and results' } },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
