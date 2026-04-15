import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

/**
 * PerplexityBot is a "query-triggered" crawler — it only visits pages when
 * users search for related content on Perplexity. Unlike ClaudeBot/Googlebot,
 * it doesn't proactively crawl sitemaps.
 *
 * This service makes periodic API searches via Perplexity Sonar to trigger
 * PerplexityBot to crawl our key pages. Each API call naturally causes
 * Perplexity to fetch and index referenced URLs.
 *
 * Schedule: 3 queries/day at 08:00, 14:00, 20:00 (UTC+8 = 00:00, 06:00, 12:00 UTC)
 */
@Injectable()
export class PerplexityPingService {
  private readonly logger = new Logger(PerplexityPingService.name);
  private client: OpenAI;
  private queryIndex = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.client = new OpenAI({
      apiKey: this.config.get('PERPLEXITY_API_KEY') || 'missing',
      baseURL: 'https://api.perplexity.ai',
    });
  }

  /** Query pool — rotates through different queries to cover various pages */
  private getQueries(): string[] {
    return [
      // Client brands
      '詹大汽車精品 評價 推薦',
      '立如整復 台北 推薦',
      // Platform discovery
      'Geovault GEO 優化平台',
      'geovault.app AI 搜尋優化',
      // Industry
      '台灣汽車美容品牌推薦 2026',
      '台北整復推拿推薦 排名',
      '台灣餐飲品牌 AI 搜尋排名',
      // Educational content
      '什麼是 GEO 分數 AI 搜尋',
      '怎麼讓 ChatGPT 推薦我的品牌',
      'llms.txt 設定教學',
      'JSON-LD 結構化資料 對 AI 搜尋的影響',
      'AI SEO 和傳統 SEO 有什麼不同',
      // Comparison
      '哪些台灣品牌被 AI 推薦過',
      'ChatGPT 會推薦哪些台灣汽車美容品牌',
      'Generative Engine Optimization 工具推薦',
      // English
      'Geovault GEO optimization platform APAC',
      'how to get recommended by ChatGPT for local business',
      'best AI SEO tool for Taiwan brands',
    ];
  }

  /** Pick next query (round-robin) */
  private nextQuery(): string {
    const queries = this.getQueries();
    const query = queries[this.queryIndex % queries.length];
    this.queryIndex++;
    return query;
  }

  /** Execute a single search via Perplexity API */
  private async ping(query: string): Promise<{ query: string; success: boolean; response?: string; error?: string }> {
    const key = this.config.get('PERPLEXITY_API_KEY');
    if (!key) return { query, success: false, error: 'PERPLEXITY_API_KEY not set' };

    try {
      const completion = await this.client.chat.completions.create({
        model: 'sonar',
        max_tokens: 512,
        messages: [{ role: 'user', content: query }],
      });

      const text = completion.choices[0]?.message?.content || '';
      const mentionsGeovault = /geovault/i.test(text);
      this.logger.log(`Perplexity ping: "${query.slice(0, 30)}..." — ${text.length} chars, mentions Geovault: ${mentionsGeovault}`);
      return { query, success: true, response: text.slice(0, 200) };
    } catch (err: any) {
      this.logger.warn(`Perplexity ping failed: ${err.message}`);
      return { query, success: false, error: err.message };
    }
  }

  /** Cron: 3 times per day — 08:00, 14:00, 20:00 (TW time) = 00:00, 06:00, 12:00 UTC */
  @Cron('0 0 * * *', { name: 'perplexity-ping-morning' })
  async morningPing() {
    await this.executeBatch('morning');
  }

  @Cron('0 6 * * *', { name: 'perplexity-ping-afternoon' })
  async afternoonPing() {
    await this.executeBatch('afternoon');
  }

  @Cron('0 12 * * *', { name: 'perplexity-ping-evening' })
  async eveningPing() {
    await this.executeBatch('evening');
  }

  /** Execute a batch of 2 queries */
  private async executeBatch(label: string) {
    this.logger.log(`Perplexity ping batch [${label}] starting...`);

    const results = [];
    for (let i = 0; i < 2; i++) {
      const query = this.nextQuery();
      const result = await this.ping(query);
      results.push(result);
      // Delay between queries
      if (i < 1) await new Promise((r) => setTimeout(r, 5000));
    }

    const success = results.filter((r) => r.success).length;
    this.logger.log(`Perplexity ping batch [${label}] done: ${success}/${results.length} success`);
  }

  /** Manual trigger for testing */
  async manualPing(query?: string): Promise<any> {
    const q = query || this.nextQuery();
    return this.ping(q);
  }
}
