import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

interface PriorityBrand {
  name: string;
  url: string;
  industry: string | null;
  bestScore: number;
}

/**
 * PerplexityBot is a "query-triggered" crawler — it only visits pages when
 * users search for related content on Perplexity.
 *
 * This service makes periodic API searches via Perplexity Sonar to trigger
 * PerplexityBot to crawl pages of priority brands (paid users + isClient sites).
 *
 * Schedule: 3 batches/day at 08:00, 14:00, 20:00 (TW time)
 */
@Injectable()
export class PerplexityPingService {
  private readonly logger = new Logger(PerplexityPingService.name);
  private client: OpenAI;
  private brandQueryIndex = 0;
  private platformQueryIndex = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.client = new OpenAI({
      apiKey: this.config.get('PERPLEXITY_API_KEY') || 'missing',
      baseURL: 'https://api.perplexity.ai',
    });
  }

  /** Get all priority brands: paid users' sites + isClient sites */
  private async getPriorityBrands(): Promise<PriorityBrand[]> {
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        OR: [
          { isClient: true },
          { user: { plan: { in: ['STARTER', 'PRO'] } } },
        ],
      },
      select: { name: true, url: true, industry: true, bestScore: true },
      orderBy: { bestScore: 'desc' },
    });
    return sites;
  }

  /** Generate search queries for a brand */
  private buildBrandQueries(brand: PriorityBrand): string[] {
    const queries: string[] = [];
    const industry = brand.industry || '';

    // Brand name direct search
    queries.push(`${brand.name} 評價 推薦`);

    // Industry + location search
    if (industry) {
      queries.push(`台灣${industry}推薦 ${brand.name}`);
      queries.push(`${industry}品牌推薦 哪個比較好`);
    }

    // AI-specific search
    queries.push(`${brand.name} AI 搜尋 能見度`);

    return queries;
  }

  /** Fixed platform-level queries (rotate through) */
  private readonly platformQueries = [
    'Geovault GEO 優化平台',
    'geovault.app AI 搜尋優化',
    '什麼是 GEO 分數 AI 搜尋',
    '怎麼讓 ChatGPT 推薦我的品牌',
    'llms.txt 設定教學',
    'AI SEO 和傳統 SEO 有什麼不同',
    'Generative Engine Optimization 工具推薦',
    'Geovault GEO optimization platform APAC',
    'how to get recommended by ChatGPT for local business',
  ];

  /** Execute a single search via Perplexity API */
  private async ping(query: string): Promise<{ query: string; success: boolean; mentioned: boolean; error?: string }> {
    const key = this.config.get('PERPLEXITY_API_KEY');
    if (!key) return { query, success: false, mentioned: false, error: 'PERPLEXITY_API_KEY not set' };

    try {
      const completion = await this.client.chat.completions.create({
        model: 'sonar',
        max_tokens: 512,
        messages: [{ role: 'user', content: query }],
      });

      const text = completion.choices[0]?.message?.content || '';
      const mentioned = /geovault/i.test(text);
      this.logger.log(`Perplexity ping: "${query.slice(0, 40)}..." — mentioned: ${mentioned}`);
      return { query, success: true, mentioned };
    } catch (err: any) {
      this.logger.warn(`Perplexity ping failed: ${err.message}`);
      return { query, success: false, mentioned: false, error: err.message };
    }
  }

  /** Cron: 3 times per day — 08:00, 14:00, 20:00 TW time */
  @Cron('0 0 * * *', { name: 'perplexity-ping-morning' })
  async morningPing() { await this.executeBatch('morning'); }

  @Cron('0 6 * * *', { name: 'perplexity-ping-afternoon' })
  async afternoonPing() { await this.executeBatch('afternoon'); }

  @Cron('0 12 * * *', { name: 'perplexity-ping-evening' })
  async eveningPing() { await this.executeBatch('evening'); }

  /** Execute a batch: 1 platform query + 1 brand query per priority brand (max 5) */
  private async executeBatch(label: string) {
    const brands = await this.getPriorityBrands();
    this.logger.log(`Perplexity ping [${label}]: ${brands.length} priority brands found`);

    const queries: string[] = [];

    // 1 platform query (round-robin)
    queries.push(this.platformQueries[this.platformQueryIndex % this.platformQueries.length]);
    this.platformQueryIndex++;

    // 1 query per priority brand (max 5 brands per batch to control cost)
    for (const brand of brands.slice(0, 5)) {
      const brandQueries = this.buildBrandQueries(brand);
      queries.push(brandQueries[this.brandQueryIndex % brandQueries.length]);
    }
    this.brandQueryIndex++;

    // Execute with delays
    let success = 0;
    let mentioned = 0;
    for (const query of queries) {
      const result = await this.ping(query);
      if (result.success) success++;
      if (result.mentioned) mentioned++;
      await new Promise((r) => setTimeout(r, 3000));
    }

    this.logger.log(`Perplexity ping [${label}] done: ${success}/${queries.length} success, ${mentioned} mentioned Geovault`);
  }

  /** Manual trigger for testing */
  async manualPing(query?: string): Promise<any> {
    if (query) return this.ping(query);

    // Show current priority brands + next queries
    const brands = await this.getPriorityBrands();
    return {
      priorityBrands: brands.map((b) => ({ name: b.name, industry: b.industry, score: b.bestScore })),
      nextPlatformQuery: this.platformQueries[this.platformQueryIndex % this.platformQueries.length],
      nextBrandQueries: brands.slice(0, 5).map((b) => this.buildBrandQueries(b)[this.brandQueryIndex % this.buildBrandQueries(b).length]),
    };
  }
}
