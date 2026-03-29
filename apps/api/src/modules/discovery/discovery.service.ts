import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanPipelineService } from '../scan/scan-pipeline.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import OpenAI from 'openai';
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
      '整復 第一次 經驗',
      '整復 腰痛 推薦',
    ],
    auto_care: [
      '汽車美容 PTT 推薦',
      '鍍膜 DIY 經驗',
      '洗車 正確方式',
      '汽車保養 注意事項',
      '汽車美容 新手 教學',
      '鍍膜 打蠟 差別',
    ],
    restaurant: [
      '台灣 美食 推薦 評論',
      '餐廳 評價 PTT',
      '台北 必吃 推薦',
    ],
    healthcare: [
      '診所 評價 PTT',
      '看診 推薦 經驗',
      '牙醫 推薦 PTT',
    ],
    beauty_salon: [
      '美髮 推薦 PTT',
      '髮型設計 評價',
      '染髮 推薦 經驗',
    ],
    cafe: [
      '咖啡廳 推薦 PTT',
      '手搖飲 推薦 排行',
      '台灣 咖啡 品牌 評價',
    ],
    fitness: [
      '健身房 推薦 PTT',
      '健身 新手 經驗',
      '瑜伽 推薦 台灣',
    ],
    pet: [
      '寵物店 推薦 PTT',
      '動物醫院 推薦 經驗',
      '寵物用品 推薦',
    ],
    education: [
      '補習班 推薦 PTT',
      '線上課程 推薦 評價',
    ],
    home_services: [
      '搬家 推薦 PTT',
      '清潔公司 推薦 經驗',
    ],
    hospitality: [
      '飯店 推薦 PTT',
      '民宿 推薦 評價',
      '旅行社 推薦 經驗',
    ],
    retail: [
      '網購 推薦 PTT',
      '電商 評價 比較',
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

      // Pick top 6 industries with fewest coverage
      const targetIndustries = industries.slice(0, 6);
      this.logger.log(`Discovery targeting ${targetIndustries.length} industries: ${targetIndustries.join(', ')}`);

      let totalDiscovered = 0;
      let totalScanned = 0;

      for (const industry of targetIndustries) {
        const queries = this.industryQueries[industry];
        // Run up to 2 different queries per industry
        const selectedQueries = queries.sort(() => Math.random() - 0.5).slice(0, 2);

        try {
          // Search with multiple queries
          const allBusinesses: DiscoveredBusiness[] = [];
          for (const query of selectedQueries) {
            const found = await this.searchBusinesses(query, industry);
            allBusinesses.push(...found);
          }

          // Deduplicate
          const seen = new Set<string>();
          const businesses = allBusinesses.filter(b => {
            if (seen.has(b.url)) return false;
            seen.add(b.url);
            return true;
          });

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

          // Scan all newly discovered ones for this industry
          const pendingSeeds = await this.prisma.seedSource.findMany({
            where: { industry, status: 'pending', source: 'auto_discovery' },
            take: 15,
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
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!openaiKey) return { created: 0 };

    const openai = new OpenAI({ apiKey: openaiKey });
    let totalCreated = 0;

    // Pick 3 industries to enrich per run
    const industries = Object.keys(this.enrichmentQueries).sort(() => Math.random() - 0.5).slice(0, 3);

    for (const industry of industries) {
    const queries = this.enrichmentQueries[industry];
    const query = queries[Math.floor(Math.random() * queries.length)];

    this.logger.log(`Enriching ${industry} with query: ${query}`);

    try {
      // Search for content
      const searchResults = await this.webSearch(query);
      if (!searchResults || searchResults.length === 0) continue;

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

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = completion.choices[0]?.message?.content || '';
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
    } // end for loop

    return { created: totalCreated };
  }

  /**
   * Search for businesses using multiple search engines.
   * Priority: SerpAPI → Google Custom Search → Bing Search
   */
  private async searchBusinesses(query: string, industry: string): Promise<DiscoveredBusiness[]> {
    const results: DiscoveredBusiness[] = [];

    try {
      const rawResults = await this.webSearch(`${query} 官網`);
      for (const item of rawResults) {
        if (this.isExcludedDomain(item.url)) continue;
        try {
          results.push({
            name: this.extractBrandName(item.title, item.url),
            url: new URL(item.url).origin,
            industry,
            description: item.snippet,
          });
        } catch {}
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
   * Unified web search: tries SerpAPI → Google → Bing in order.
   */
  private async webSearch(query: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
    // 1. Try SerpAPI (most reliable, free 100/month)
    const serpKey = this.config.get<string>('SERP_API_KEY');
    if (serpKey) {
      try {
        const params = new URLSearchParams({
          q: query,
          api_key: serpKey,
          engine: 'google',
          gl: 'tw',
          hl: 'zh-TW',
          num: '10',
        });
        const res = await fetch(`https://serpapi.com/search.json?${params}`);
        if (res.ok) {
          const data = await res.json();
          const organic = data.organic_results || [];
          this.logger.log(`SerpAPI: ${organic.length} results for "${query.slice(0, 30)}"`);
          return organic.map((r: any) => ({ title: r.title || '', snippet: r.snippet || '', url: r.link || '' }));
        } else {
          const err = await res.text();
          this.logger.warn(`SerpAPI error ${res.status}: ${err.slice(0, 100)}`);
        }
      } catch (err) {
        this.logger.warn(`SerpAPI failed: ${err}`);
      }
    }

    // 2. Try Google Custom Search
    const googleKey = this.config.get<string>('GOOGLE_SEARCH_API_KEY');
    const googleCx = this.config.get<string>('GOOGLE_SEARCH_CX');
    if (googleKey && googleCx) {
      try {
        const params = new URLSearchParams({ q: query, key: googleKey, cx: googleCx, num: '10', lr: 'lang_zh-TW' });
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
        if (res.ok) {
          const data = await res.json();
          this.logger.log(`Google Search: ${(data.items || []).length} results for "${query.slice(0, 30)}"`);
          return (data.items || []).map((i: any) => ({ title: i.title, snippet: i.snippet, url: i.link }));
        } else {
          const err = await res.text();
          this.logger.warn(`Google Search error ${res.status}: ${err.slice(0, 100)}`);
        }
      } catch (err) {
        this.logger.warn(`Google Search failed: ${err}`);
      }
    }

    // 3. Try Bing Search
    const bingKey = this.config.get<string>('BING_SEARCH_API_KEY');
    if (bingKey) {
      try {
        const params = new URLSearchParams({ q: query, count: '10', mkt: 'zh-TW' });
        const res = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
          headers: { 'Ocp-Apim-Subscription-Key': bingKey },
        });
        if (res.ok) {
          const data = await res.json();
          this.logger.log(`Bing Search: ${(data.webPages?.value || []).length} results for "${query.slice(0, 30)}"`);
          return (data.webPages?.value || []).map((p: any) => ({ title: p.name, snippet: p.snippet, url: p.url }));
        }
      } catch (err) {
        this.logger.warn(`Bing Search failed: ${err}`);
      }
    }

    this.logger.warn('No search API available (SERP_API_KEY / GOOGLE_SEARCH_API_KEY / BING_SEARCH_API_KEY)');
    return [];
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
