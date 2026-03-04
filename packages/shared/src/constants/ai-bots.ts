export interface AiBotDefinition {
  name: string;
  org: string;
  uaPattern: string;
}

export const AI_BOTS: AiBotDefinition[] = [
  { name: 'ClaudeBot', org: 'Anthropic', uaPattern: 'ClaudeBot' },
  { name: 'GPTBot', org: 'OpenAI', uaPattern: 'GPTBot' },
  { name: 'ChatGPT-User', org: 'OpenAI', uaPattern: 'ChatGPT-User' },
  { name: 'Google-Extended', org: 'Google', uaPattern: 'Google-Extended' },
  { name: 'Googlebot', org: 'Google', uaPattern: 'Googlebot' },
  { name: 'Bingbot', org: 'Microsoft', uaPattern: 'bingbot' },
  { name: 'PerplexityBot', org: 'Perplexity', uaPattern: 'PerplexityBot' },
  { name: 'YouBot', org: 'You.com', uaPattern: 'YouBot' },
  { name: 'CCBot', org: 'Common Crawl', uaPattern: 'CCBot' },
  { name: 'Bytespider', org: 'ByteDance', uaPattern: 'Bytespider' },
];

export function matchAiBot(userAgent: string): AiBotDefinition | null {
  for (const bot of AI_BOTS) {
    if (userAgent.includes(bot.uaPattern)) {
      return bot;
    }
  }
  return null;
}
