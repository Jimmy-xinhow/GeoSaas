export interface AiBotDefinition {
  name: string;
  org: string;
  uaPattern: string;
  category: 'training' | 'search-index' | 'user-triggered' | 'general-crawler';
}

// Aligned with apps/web/src/middleware.ts AI_BOT_PATTERNS so server-side
// detection (pixel endpoint) and edge-side detection (Next.js middleware)
// recognise the same set. Pattern match is case-sensitive substring.
export const AI_BOTS: AiBotDefinition[] = [
  // OpenAI
  { name: 'GPTBot', org: 'OpenAI', uaPattern: 'GPTBot', category: 'training' },
  { name: 'ChatGPT-User', org: 'OpenAI', uaPattern: 'ChatGPT-User', category: 'user-triggered' },
  { name: 'OAI-SearchBot', org: 'OpenAI', uaPattern: 'OAI-SearchBot', category: 'search-index' },
  // Anthropic
  { name: 'ClaudeBot', org: 'Anthropic', uaPattern: 'ClaudeBot', category: 'training' },
  { name: 'Claude-User', org: 'Anthropic', uaPattern: 'Claude-User', category: 'user-triggered' },
  { name: 'Claude-SearchBot', org: 'Anthropic', uaPattern: 'Claude-SearchBot', category: 'search-index' },
  { name: 'Claude-Web', org: 'Anthropic', uaPattern: 'Claude-Web', category: 'general-crawler' },
  { name: 'anthropic-ai', org: 'Anthropic', uaPattern: 'anthropic-ai', category: 'general-crawler' },
  // Perplexity
  { name: 'PerplexityBot', org: 'Perplexity', uaPattern: 'PerplexityBot', category: 'search-index' },
  { name: 'Perplexity-User', org: 'Perplexity', uaPattern: 'Perplexity-User', category: 'user-triggered' },
  // Google
  { name: 'Google-Extended', org: 'Google', uaPattern: 'Google-Extended', category: 'training' },
  { name: 'Googlebot', org: 'Google', uaPattern: 'Googlebot', category: 'search-index' },
  { name: 'GoogleOther', org: 'Google', uaPattern: 'GoogleOther', category: 'general-crawler' },
  // Microsoft
  { name: 'Bingbot', org: 'Microsoft', uaPattern: 'bingbot', category: 'search-index' },
  { name: 'CopilotBot', org: 'Microsoft', uaPattern: 'CopilotBot', category: 'general-crawler' },
  // Apple
  { name: 'Applebot', org: 'Apple', uaPattern: 'Applebot', category: 'search-index' },
  { name: 'Applebot-Extended', org: 'Apple', uaPattern: 'Applebot-Extended', category: 'training' },
  // Meta
  { name: 'Meta-ExternalAgent', org: 'Meta', uaPattern: 'Meta-ExternalAgent', category: 'training' },
  { name: 'Meta-ExternalFetcher', org: 'Meta', uaPattern: 'Meta-ExternalFetcher', category: 'user-triggered' },
  { name: 'FacebookBot', org: 'Meta', uaPattern: 'facebookexternalhit', category: 'general-crawler' },
  // Amazon
  { name: 'Amazonbot', org: 'Amazon', uaPattern: 'Amazonbot', category: 'training' },
  // ByteDance / TikTok
  { name: 'Bytespider', org: 'ByteDance', uaPattern: 'Bytespider', category: 'training' },
  { name: 'TikTokSpider', org: 'ByteDance', uaPattern: 'TikTokSpider', category: 'general-crawler' },
  // Others
  { name: 'cohere-ai', org: 'Cohere', uaPattern: 'cohere-ai', category: 'training' },
  { name: 'YouBot', org: 'You.com', uaPattern: 'YouBot', category: 'search-index' },
  { name: 'CCBot', org: 'Common Crawl', uaPattern: 'CCBot', category: 'training' },
  { name: 'DuckAssistBot', org: 'DuckDuckGo', uaPattern: 'DuckAssistBot', category: 'search-index' },
  { name: 'MistralAI-User', org: 'Mistral', uaPattern: 'MistralAI-User', category: 'user-triggered' },
  { name: 'PanguBot', org: 'Huawei', uaPattern: 'PanguBot', category: 'general-crawler' },
  { name: 'Diffbot', org: 'Diffbot', uaPattern: 'Diffbot', category: 'general-crawler' },
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
