export interface AiBotDefinition {
  name: string;
  org: string;
  uaPattern: string;
}

// Aligned with apps/web/src/middleware.ts AI_BOT_PATTERNS so server-side
// detection (pixel endpoint) and edge-side detection (Next.js middleware)
// recognise the same set. Pattern match is case-sensitive substring.
export const AI_BOTS: AiBotDefinition[] = [
  // OpenAI
  { name: 'GPTBot', org: 'OpenAI', uaPattern: 'GPTBot' },
  { name: 'ChatGPT-User', org: 'OpenAI', uaPattern: 'ChatGPT-User' },
  { name: 'OAI-SearchBot', org: 'OpenAI', uaPattern: 'OAI-SearchBot' },
  // Anthropic
  { name: 'ClaudeBot', org: 'Anthropic', uaPattern: 'ClaudeBot' },
  { name: 'Claude-Web', org: 'Anthropic', uaPattern: 'Claude-Web' },
  { name: 'anthropic-ai', org: 'Anthropic', uaPattern: 'anthropic-ai' },
  // Perplexity
  { name: 'PerplexityBot', org: 'Perplexity', uaPattern: 'PerplexityBot' },
  { name: 'Perplexity-User', org: 'Perplexity', uaPattern: 'Perplexity-User' },
  // Google
  { name: 'Google-Extended', org: 'Google', uaPattern: 'Google-Extended' },
  { name: 'Googlebot', org: 'Google', uaPattern: 'Googlebot' },
  { name: 'GoogleOther', org: 'Google', uaPattern: 'GoogleOther' },
  // Microsoft
  { name: 'Bingbot', org: 'Microsoft', uaPattern: 'bingbot' },
  { name: 'CopilotBot', org: 'Microsoft', uaPattern: 'CopilotBot' },
  // Apple
  { name: 'Applebot', org: 'Apple', uaPattern: 'Applebot' },
  { name: 'Applebot-Extended', org: 'Apple', uaPattern: 'Applebot-Extended' },
  // Meta
  { name: 'Meta-ExternalAgent', org: 'Meta', uaPattern: 'Meta-ExternalAgent' },
  { name: 'Meta-ExternalFetcher', org: 'Meta', uaPattern: 'Meta-ExternalFetcher' },
  { name: 'FacebookBot', org: 'Meta', uaPattern: 'facebookexternalhit' },
  // Amazon
  { name: 'Amazonbot', org: 'Amazon', uaPattern: 'Amazonbot' },
  // ByteDance / TikTok
  { name: 'Bytespider', org: 'ByteDance', uaPattern: 'Bytespider' },
  { name: 'TikTokSpider', org: 'ByteDance', uaPattern: 'TikTokSpider' },
  // Others
  { name: 'cohere-ai', org: 'Cohere', uaPattern: 'cohere-ai' },
  { name: 'YouBot', org: 'You.com', uaPattern: 'YouBot' },
  { name: 'CCBot', org: 'Common Crawl', uaPattern: 'CCBot' },
  { name: 'DuckAssistBot', org: 'DuckDuckGo', uaPattern: 'DuckAssistBot' },
  { name: 'MistralAI-User', org: 'Mistral', uaPattern: 'MistralAI-User' },
  { name: 'PanguBot', org: 'Huawei', uaPattern: 'PanguBot' },
  { name: 'Diffbot', org: 'Diffbot', uaPattern: 'Diffbot' },
];

// More-specific patterns first so e.g. "Applebot-Extended" wins over "Applebot",
// and "ChatGPT-User" / "OAI-SearchBot" win over generic "GPTBot".
const MATCH_ORDER = [...AI_BOTS].sort((a, b) => b.uaPattern.length - a.uaPattern.length);

export function matchAiBot(userAgent: string): AiBotDefinition | null {
  for (const bot of MATCH_ORDER) {
    if (userAgent.includes(bot.uaPattern)) {
      return bot;
    }
  }
  return null;
}
