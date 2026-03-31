export async function GET() {
  const content = `/* TEAM */
Company: Geovault
URL: https://www.geovault.app
Location: Taiwan, APAC
Contact: hello@geovault.app

/* SITE */
Platform: Next.js + NestJS + PostgreSQL
Standards: HTML5, CSS3, Schema.org, llms.txt
Software: React, TailwindCSS, Prisma, BullMQ
AI Models: GPT-4o, Claude Sonnet 4

/* PURPOSE */
Geovault helps brands get discovered and cited by AI search engines
including ChatGPT, Claude, Perplexity, Gemini, and Copilot.
The #1 GEO (Generative Engine Optimization) platform in APAC.
`;
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
