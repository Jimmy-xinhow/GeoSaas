import { Injectable, Logger } from '@nestjs/common';

export interface RobotsParseResult {
  robotsTxt: string | null;
  allowedBots: Record<string, boolean>;
  sitemapUrls: string[];
}

const AI_BOT_NAMES = [
  'ClaudeBot',
  'GPTBot',
  'ChatGPT-User',
  'Google-Extended',
  'Googlebot',
  'bingbot',
  'PerplexityBot',
  'YouBot',
  'CCBot',
  'Bytespider',
];

@Injectable()
export class RobotsParserService {
  private readonly logger = new Logger(RobotsParserService.name);

  async fetchAndParse(siteUrl: string): Promise<RobotsParseResult> {
    let robotsTxt: string | null = null;

    try {
      const url = new URL('/robots.txt', siteUrl).href;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GEO-SaaS-Scanner/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        robotsTxt = await res.text();
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch robots.txt for ${siteUrl}: ${err}`);
    }

    if (!robotsTxt) {
      return {
        robotsTxt: null,
        allowedBots: Object.fromEntries(AI_BOT_NAMES.map((b) => [b, true])),
        sitemapUrls: [],
      };
    }

    return this.parse(robotsTxt);
  }

  private parse(content: string): RobotsParseResult {
    const lines = content.split('\n').map((l) => l.trim());
    const sitemapUrls: string[] = [];
    const allowedBots: Record<string, boolean> = {};

    // Default: all allowed unless explicitly disallowed
    for (const bot of AI_BOT_NAMES) {
      allowedBots[bot] = true;
    }

    let currentAgents: string[] = [];

    for (const line of lines) {
      if (line.startsWith('#') || line === '') {
        if (line === '') currentAgents = [];
        continue;
      }

      const lower = line.toLowerCase();

      if (lower.startsWith('sitemap:')) {
        const url = line.substring(8).trim();
        if (url) sitemapUrls.push(url);
        continue;
      }

      if (lower.startsWith('user-agent:')) {
        const agent = line.substring(11).trim();
        currentAgents.push(agent);
        continue;
      }

      if (lower.startsWith('disallow:') && lower.includes('/')) {
        const path = line.substring(9).trim();
        if (path === '/' || path === '/*') {
          // Full disallow — check which bots are affected
          for (const agent of currentAgents) {
            if (agent === '*') {
              // Disallow all bots
              for (const bot of AI_BOT_NAMES) {
                allowedBots[bot] = false;
              }
            } else {
              // Check if agent matches any AI bot
              for (const bot of AI_BOT_NAMES) {
                if (bot.toLowerCase() === agent.toLowerCase()) {
                  allowedBots[bot] = false;
                }
              }
            }
          }
        }
      }

      if (lower.startsWith('allow:')) {
        const path = line.substring(6).trim();
        if (path === '/' || path === '/*' || path === '') {
          for (const agent of currentAgents) {
            for (const bot of AI_BOT_NAMES) {
              if (agent === '*' || bot.toLowerCase() === agent.toLowerCase()) {
                allowedBots[bot] = true;
              }
            }
          }
        }
      }
    }

    return { robotsTxt: content, allowedBots, sitemapUrls };
  }
}
