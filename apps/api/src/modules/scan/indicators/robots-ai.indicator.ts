import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

const AI_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'Bytespider',
  'CopilotBot',
  'Amazonbot',
  'FacebookBot',
  'bingbot',
];

@Injectable()
export class RobotsAiIndicator implements IIndicatorAnalyzer {
  name = 'robots_ai';

  async analyze({ robotsTxt }: AnalysisInput): Promise<IndicatorResult> {
    if (!robotsTxt) {
      return {
        score: 50,
        status: 'warning',
        details: { found: false, blockedBots: [], allowedBots: [], cloudflareManaged: false },
        suggestion: '未偵測到 robots.txt 檔案。雖然沒有 robots.txt 代表 AI 爬蟲可以自由存取，但建議主動設定 robots.txt 並明確允許 AI 爬蟲，以表達歡迎態度。',
        autoFixable: false,
      };
    }

    const lines = robotsTxt.split('\n');
    const isCloudflareManaged = robotsTxt.includes('Cloudflare Managed');

    // Parse robots.txt rules per user-agent
    const rules: Record<string, { allow: string[]; disallow: string[] }> = {};
    let currentAgents: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;

      const match = trimmed.match(/^(User-[Aa]gent|Allow|Disallow)\s*:\s*(.*)$/i);
      if (!match) continue;

      const [, directive, value] = match;
      const d = directive.toLowerCase();
      const v = value.trim();

      if (d === 'user-agent') {
        currentAgents = [v];
        if (!rules[v]) rules[v] = { allow: [], disallow: [] };
      } else if (d === 'allow') {
        currentAgents.forEach((a) => {
          if (!rules[a]) rules[a] = { allow: [], disallow: [] };
          rules[a].allow.push(v);
        });
      } else if (d === 'disallow') {
        currentAgents.forEach((a) => {
          if (!rules[a]) rules[a] = { allow: [], disallow: [] };
          rules[a].disallow.push(v);
        });
      }
    }

    // Check each AI bot
    const blockedBots: string[] = [];
    const allowedBots: string[] = [];

    for (const bot of AI_BOTS) {
      const botRules = rules[bot];
      if (botRules) {
        // Bot has explicit rules
        const hasRootDisallow = botRules.disallow.some((d) => d === '/' || d === '/*');
        const hasRootAllow = botRules.allow.some((a) => a === '/' || a === '/*');

        if (hasRootDisallow && !hasRootAllow) {
          blockedBots.push(bot);
        } else {
          allowedBots.push(bot);
        }
      } else {
        // No explicit rules — falls back to wildcard
        const wildcard = rules['*'];
        if (wildcard) {
          const hasRootDisallow = wildcard.disallow.some((d) => d === '/' || d === '/*');
          if (hasRootDisallow) {
            blockedBots.push(bot);
          } else {
            allowedBots.push(bot);
          }
        } else {
          allowedBots.push(bot);
        }
      }
    }

    const blockedCount = blockedBots.length;
    const totalBots = AI_BOTS.length;
    const allowedPercent = Math.round(((totalBots - blockedCount) / totalBots) * 100);

    // Score calculation
    let score: number;
    let status: 'pass' | 'warning' | 'fail';
    let suggestion: string | undefined;

    if (blockedCount === 0) {
      score = 100;
      status = 'pass';
      suggestion = undefined;
    } else if (blockedCount <= 2) {
      score = 70;
      status = 'warning';
      suggestion = `robots.txt 封鎖了 ${blockedBots.join('、')}。建議移除封鎖，讓所有 AI 爬蟲都能存取您的網站內容。`;
    } else if (blockedCount <= 5) {
      score = 30;
      status = 'fail';
      suggestion = `robots.txt 封鎖了 ${blockedCount} 個 AI 爬蟲（${blockedBots.slice(0, 3).join('、')}等）。這將嚴重影響您在 AI 搜尋引擎中的能見度。${isCloudflareManaged ? '偵測到 Cloudflare 自動管理的封鎖規則，請到 Cloudflare Dashboard 的 Security > Bots 或 AI 區塊停用 robots.txt 管理功能。' : '請修改 robots.txt，將 Disallow 改為 Allow。'}`;
    } else {
      score = 0;
      status = 'fail';
      suggestion = `robots.txt 封鎖了幾乎所有 AI 爬蟲（${blockedCount}/${totalBots}）。您的網站對 AI 搜尋引擎完全不可見！${isCloudflareManaged ? '這是 Cloudflare 自動注入的封鎖規則。請立即到 Cloudflare Dashboard 停用 AI robots.txt 管理功能，否則 ChatGPT、Claude、Perplexity 等都無法爬取您的網站。' : '請修改 robots.txt，移除對 GPTBot、ClaudeBot 等 AI 爬蟲的 Disallow 規則。'}`;
    }

    return {
      score,
      status,
      details: {
        found: true,
        cloudflareManaged: isCloudflareManaged,
        blockedBots,
        allowedBots,
        blockedCount,
        totalBots,
        allowedPercent,
      },
      suggestion,
      autoFixable: false,
    };
  }
}
