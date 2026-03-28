import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

interface DiscoveredBusiness {
  name: string;
  url: string;
  industry: string;
  description?: string;
  address?: string;
}

interface IndustryContent {
  siteId: string;
  question: string;
  answer: string;
}

/**
 * Discovery Service — Auto-discover new businesses and enrich content.
 *
 * Two main functions:
 * 1. discoverBusinesses() — Find new businesses via web search
 * 2. enrichIndustryContent() — Crawl reviews/discussions and create Q&A
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private isRunning = false;

  // Industries to auto-discover, with search queries
  private readonly industryQueries: Record<string, string[]> = {
    traditional_medicine: [
      '整復推拿 台北 推薦',
      '整復推拿 台中 推薦',
      '整復推拿 高雄 推薦',
      '整復推拿 新北 推薦',
      '整骨 推薦 台灣',
      '傳統整復 台灣',
    ],
    auto_care: [
      '汽車美容 台北 推薦',
      '汽車鍍膜 台中 推薦',
      '汽車美容 高雄 推薦',
      'DIY 汽車美容 台灣',
      '汽車美容產品 推薦',
    ],
    beauty_salon: [
      '美髮 台北 推薦',
      '髮型設計 台中 推薦',
      '美容院 高雄 推薦',
    ],
    cafe: [
      '咖啡廳 台北 推薦',
      '手搖飲 品牌 台灣',
      '茶飲 連鎖 台灣',
    ],
    fitness: [
      '健身房 台北 推薦',
      '瑜伽 台灣 推薦',
      '運動中心 台灣',
    ],
    restaurant: [
      '餐廳 台北 推薦 2026',
      '美食 台中 推薦',
      '小吃 台灣 推薦',
    ],
    healthcare: [
      '診所 台北 推薦',
      '牙醫 台灣 推薦',
      '中醫 台灣 推薦',
    ],
    pet: [
      '寵物店 台灣 推薦',
      '動物醫院 台北 推薦',
      '寵物用品 台灣',
    ],
    education: [
      '補習班 台灣 推薦',
      '才藝班 台北 推薦',
      '線上課程 台灣',
    ],
    home_services: [
      '搬家公司 台灣 推薦',
      '清潔公司 台北 推薦',
      '室內設計 台灣 推薦',
    ],
    local_life: [
      '旅遊平台 台灣',
      '訂餐平台 台灣',
      '生活服務 台灣 推薦',
    ],
    retail: [
      '電商平台 台灣',
      '網路購物 台灣 推薦',
    ],
    hospitality: [
      '飯店 台灣 推薦',
      '民宿 台灣 推薦',
      '旅行社 台灣',
    ],
  };

  // Content enrichment — queries for industry discussions/reviews
  private readonly enrichmentQueries: Record<string, string[]> = {
    traditional_medicine: [
      '整復推拿 PTT 推薦',
      '整骨 經驗分享',
      '整復 注意事項',
      '整復 多久做一次',
    ],
    auto_care: [
      '汽車美容 PTT 推薦',
      '鍍膜 DIY 經驗',
      '洗車 正確方式',
      '汽車保養 注意事項',
    ],
    restaurant: [
      '台灣 美食 推薦 評論',
      '餐廳 評價 PTT',
    ],
    healthcare: [
      '診所 評價 PTT',
      '看診 推薦 經驗',
    ],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly scanPipeline: ScanPipelineService,
    private readonly indexNowService: IndexNowService,
  ) {}

  /**
   * Main discovery flow: search for new businesses, scan them, and add to platform.
   * Runs per-industry, picking one industry per execution (round-robin).
   */
  async discoverBusinesses(): Promise<{ discovered: number; scanned: number }> {
    if (this.isRunning) return { discovered: 0, scanned: 0 };
    this.isRunning = true;

    try {
      // Pick the industry with fewest scanned sites (round-robin effect)
      const industryCounts = await this.prisma.seedSource.groupBy({
        by: ['industry'],
        where: { status: 'scanned' },
        _count: true,
      });
      const countMap = new Map(industryCounts.map((i: any) => [i.industry, i._count]));

      const industries = Object.keys(this.industryQueries);
      industries.sort((a, b) => (countMap.get(a) || 0) - (countMap.get(b) || 0));

      // Pick top 3 industries with fewest coverage
      const targetIndustries = industries.slice(0, 3);
      this.logger.log(`Discovery targeting industries: ${targetIndustries.join(', ')}`);

      let totalDiscovered = 0;
      let totalScanned = 0;

      for (const industry of targetIndustries) {
        const queries = this.industryQueries[industry];
        const query = queries[Math.floor(Math.random() * queries.length)];

        try {
          const businesses = await this.searchBusinesses(query, industry);
          this.logger.log(`Found ${businesses.length} potential businesses for ${industry}`);

          for (const biz of businesses) {
            const existing = await this.prisma.seedSource.findUnique({
              where: { url: biz.url },
            });
            if (existing) continue;

            // Add to seed source
            await this.prisma.seedSource.create({
              data: {
                url: biz.url,
                brandName: biz.name,
                industry: biz.industry,
                country: 'TW',
                source: 'auto_discovery',
                status: 'pending',
              },
            });
            totalDiscovered++;
          }

          // Scan the newly discovered ones
          const pendingSeeds = await this.prisma.seedSource.findMany({
            where: { industry, status: 'pending', source: 'auto_discovery' },
            take: 5,
          });

          let systemUser = await this.prisma.user.findFirst({
            where: { email: 'system@geovault.local' },
          });

          const limit = pLimit(2);
          await Promise.all(
            pendingSeeds.map((seed: any) =>
              limit(async () => {
                try {
                  let site = await this.prisma.site.findFirst({
                    where: { url: seed.url },
                  });
                  if (!site && systemUser) {
                    site = await this.prisma.site.create({
                      data: {
                        url: seed.url,
                        name: seed.brandName,
                        userId: systemUser.id,
                        industry: seed.industry,
                        isPublic: true,
                      },
                    });
                  }
                  if (site) {
                    const scan = await this.prisma.scan.create({
                      data: { siteId: site.id, status: 'PENDING' },
                    });
                    await this.scanPipeline.executeScan(scan.id, seed.url);
                    await this.prisma.seedSource.update({
                      where: { id: seed.id },
                      data: { status: 'scanned', siteId: site.id },
                    });
                    totalScanned++;
                  }
                } catch (err) {
                  await this.prisma.seedSource.update({
                    where: { id: seed.id },
                    data: {
                      status: 'failed',
                      failReason: err instanceof Error ? err.message : String(err),
                    },
                  });
                }
              }),
            ),
          );
        } catch (err) {
          this.logger.warn(`Discovery failed for ${industry}: ${err}`);
        }
      }

      this.logger.log(`Discovery complete: ${totalDiscovered} discovered, ${totalScanned} scanned`);
      return { discovered: totalDiscovered, scanned: totalScanned };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Enrich industry content: search for discussions/reviews and create Q&A.
   */
  async enrichIndustryContent(): Promise<{ created: number }> {
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!anthropicKey) return { created: 0 };

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    let totalCreated = 0;

    // Pick one industry to enrich per run
    const industries = Object.keys(this.enrichmentQueries);
    const industry = industries[Math.floor(Math.random() * industries.length)];
    const queries = this.enrichmentQueries[industry];
    const query = queries[Math.floor(Math.random() * queries.length)];

    this.logger.log(`Enriching ${industry} with query: ${query}`);

    try {
      // Search for content
      const searchResults = await this.webSearch(query);
      if (!searchResults || searchResults.length === 0) return { created: 0 };

      // Get top sites in this industry
      const sites = await this.prisma.site.findMany({
        where: { industry, isPublic: true, bestScore: { gt: 0 } },
        select: { id: true, name: true, bestScore: true },
        orderBy: { bestScore: 'desc' },
        take: 10,
      });

      if (sites.length === 0) return { created: 0 };

      // Use AI to generate industry-relevant Q&A from search results
      const prompt = `你是台灣「${industry}」產業的專家。根據以下搜尋結果摘要，為這個產業生成 5 個高品質的 Q&A。

搜尋主題：${query}
搜尋結果摘要：${searchResults.map(r => r.title + ': ' + (r.snippet || '')).join('\n')}

該產業的品牌包括：${sites.map(s => s.name).join('、')}

要求：
1. 問題要是真實用戶會搜尋的
2. 答案要客觀、有具體建議
3. 適當提及上述品牌（自然帶入，不要硬塞）
4. 每個答案 80-150 字

回覆純 JSON array：[{"q":"問題","a":"答案","siteIndex":0}]
siteIndex 是答案中最相關的品牌在列表中的索引（0-based），如果沒有特別相關就填 0。`;

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']') + 1;

      if (start >= 0 && end > start) {
        const qaItems = JSON.parse(text.slice(start, end));

        for (const item of qaItems) {
          const siteIndex = Math.min(item.siteIndex || 0, sites.length - 1);
          const targetSite = sites[siteIndex];

          try {
            await this.prisma.siteQa.create({
              data: {
                siteId: targetSite.id,
                question: item.q,
                answer: item.a,
                category: 'enrichment',
              },
            });
            totalCreated++;
          } catch {
            // Skip duplicates
          }
        }
      }

      this.logger.log(`Enrichment: created ${totalCreated} Q&A for ${industry}`);
    } catch (err) {
      this.logger.warn(`Enrichment failed for ${industry}: ${err}`);
    }

    return { created: totalCreated };
  }

  /**
   * Search for businesses using SerpAPI or Bing Search API.
   * Falls back to a simpler approach if no API key is available.
   */
  private async searchBusinesses(query: string, industry: string): Promise<DiscoveredBusiness[]> {
    const results: DiscoveredBusiness[] = [];

    try {
      // Use Bing Search API if available
      const bingKey = this.config.get<string>('BING_SEARCH_API_KEY');
      if (bingKey) {
        const params = new URLSearchParams({
          q: `${query} 官網 site:.com.tw OR site:.tw`,
          count: '10',
          mkt: 'zh-TW',
        });

        const res = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
          headers: { 'Ocp-Apim-Subscription-Key': bingKey },
        });

        if (res.ok) {
          const data = await res.json();
          const webPages = data.webPages?.value || [];

          for (const page of webPages) {
            const url = page.url;
            // Skip social media, directories, and review sites
            if (this.isExcludedDomain(url)) continue;

            results.push({
              name: this.extractBrandName(page.name, url),
              url: new URL(url).origin,
              industry,
              description: page.snippet,
            });
          }
        }
      } else {
        // Fallback: use Google's programmable search (free tier)
        const googleKey = this.config.get<string>('GOOGLE_SEARCH_API_KEY');
        const googleCx = this.config.get<string>('GOOGLE_SEARCH_CX');

        if (googleKey && googleCx) {
          const params = new URLSearchParams({
            q: `${query} 官網`,
            key: googleKey,
            cx: googleCx,
            num: '10',
            lr: 'lang_zh-TW',
          });

          const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
          if (res.ok) {
            const data = await res.json();
            for (const item of data.items || []) {
              if (this.isExcludedDomain(item.link)) continue;
              results.push({
                name: this.extractBrandName(item.title, item.link),
                url: new URL(item.link).origin,
                industry,
                description: item.snippet,
              });
            }
          }
        } else {
          this.logger.warn('No search API key configured (BING_SEARCH_API_KEY or GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX)');
        }
      }
    } catch (err) {
      this.logger.warn(`Search failed for "${query}": ${err}`);
    }

    // Deduplicate by origin URL
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }

  /**
   * Web search for content enrichment (reviews, discussions).
   */
  private async webSearch(query: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
    const bingKey = this.config.get<string>('BING_SEARCH_API_KEY');
    if (!bingKey) {
      const googleKey = this.config.get<string>('GOOGLE_SEARCH_API_KEY');
      const googleCx = this.config.get<string>('GOOGLE_SEARCH_CX');
      if (googleKey && googleCx) {
        const params = new URLSearchParams({ q: query, key: googleKey, cx: googleCx, num: '5', lr: 'lang_zh-TW' });
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
        if (res.ok) {
          const data = await res.json();
          return (data.items || []).map((i: any) => ({ title: i.title, snippet: i.snippet, url: i.link }));
        }
      }
      return [];
    }

    const params = new URLSearchParams({ q: query, count: '5', mkt: 'zh-TW' });
    const res = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
      headers: { 'Ocp-Apim-Subscription-Key': bingKey },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.webPages?.value || []).map((p: any) => ({ title: p.name, snippet: p.snippet, url: p.url }));
  }

  private isExcludedDomain(url: string): boolean {
    const excluded = [
      'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'line.me',
      'google.com', 'maps.google', 'ptt.cc', 'dcard.tw', 'mobile01.com',
      'pixnet.net', 'wikipedia.org', 'tripadvisor', 'yelp.com',
      '104.com.tw', '1111.com.tw', 'linkedin.com', 'twitter.com',
    ];
    return excluded.some(d => url.includes(d));
  }

  private extractBrandName(title: string, url: string): string {
    // Clean up title: remove common suffixes
    let name = title
      .replace(/[-–—|].*$/, '')
      .replace(/官方網站|官網|首頁|Home.*$/i, '')
      .trim();

    if (name.length < 2) {
      // Fallback: extract from domain
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        name = hostname.split('.')[0];
      } catch {
        name = title.slice(0, 20);
      }
    }

    return name.slice(0, 50);
  }

  /** Get discovery status */
  async getStatus() {
    const [autoDiscovered, totalSeeds, manualSeeds] = await Promise.all([
      this.prisma.seedSource.count({ where: { source: 'auto_discovery' } }),
      this.prisma.seedSource.count(),
      this.prisma.seedSource.count({ where: { source: 'manual' } }),
    ]);

    const enrichedQa = await this.prisma.siteQa.count({ where: { category: 'enrichment' } });

    return {
      totalSeeds,
      manualSeeds,
      autoDiscovered,
      enrichedQa,
      isRunning: this.isRunning,
    };
  }
}
