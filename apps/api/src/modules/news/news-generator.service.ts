import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

interface NewsSource {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

const NEWS_QUERIES = [
  'AI search optimization 2026',
  'ChatGPT SEO brand recommendation',
  'generative engine optimization GEO',
  'AI citation brand visibility',
  'llms.txt AI crawler',
  'Perplexity AI search marketing',
  'Claude AI brand mention',
  'Google Gemini search recommendation',
  'AI搜尋引擎優化',
  'ChatGPT品牌推薦策略',
  'AI行銷趨勢2026',
  'GEO優化最新技術',
  '生成式AI搜尋對SEO影響',
  'AI爬蟲網站優化',
  'JSON-LD結構化資料AI',
  'FAQ Schema AI搜尋',
];

const CATEGORIES = [
  'ai-search',     // AI 搜尋趨勢
  'geo-strategy',  // GEO 優化策略
  'brand-ai',      // 品牌 AI 行銷
  'tech-update',   // 技術更新
  'case-study',    // 案例分析
  'industry',      // 產業洞察
];

@Injectable()
export class NewsGeneratorService {
  private readonly logger = new Logger(NewsGeneratorService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Daily cron: generate 10-20 news articles
   * Runs at 06:00 and 18:00 every day (10 articles each = 20/day)
   */
  @Cron('0 6 * * *')
  async generateMorningBatch() {
    await this.generateBatch(10);
  }

  @Cron('0 18 * * *')
  async generateEveningBatch() {
    await this.generateBatch(10);
  }

  /**
   * Generate a batch of news articles
   */
  async generateBatch(count: number = 10): Promise<{ generated: number; errors: number }> {
    this.logger.log(`Starting news generation batch: ${count} articles`);

    if (!this.openai) {
      this.logger.warn('OpenAI not configured, skipping news generation');
      return { generated: 0, errors: 0 };
    }

    let generated = 0;
    let errors = 0;

    // Pick random queries
    const shuffled = [...NEWS_QUERIES].sort(() => Math.random() - 0.5);
    const queries = shuffled.slice(0, Math.min(count, shuffled.length));

    for (const query of queries) {
      try {
        // 1. Search for trending topics
        const sources = await this.searchNews(query);
        if (sources.length === 0) {
          this.logger.warn(`No sources found for: ${query}`);
          continue;
        }

        // 2. Generate original analysis article
        const article = await this.generateArticle(sources, query);
        if (!article) continue;

        // 3. Check for duplicates (similar title in last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const existing = await this.prisma.newsArticle.findFirst({
          where: {
            title: { contains: article.title.slice(0, 20) },
            createdAt: { gte: sevenDaysAgo },
          },
        });
        if (existing) {
          this.logger.log(`Skip duplicate: ${article.title.slice(0, 30)}`);
          continue;
        }

        // 4. Save to DB
        const slug = `news-${article.title
          .slice(0, 40)
          .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
          .toLowerCase()}-${Date.now().toString(36)}`;

        await this.prisma.newsArticle.create({
          data: {
            slug,
            title: article.title,
            titleEn: article.titleEn,
            summary: article.summary,
            summaryEn: article.summaryEn,
            sourceUrl: sources[0].url,
            sourceName: 'Geovault AI Analysis',
            category: article.category,
            published: true,
            publishedAt: new Date(),
          },
        });

        generated++;
        this.logger.log(`Generated: ${article.title.slice(0, 40)}`);

        // Rate limit
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        errors++;
        this.logger.error(`Failed to generate for "${query}": ${err}`);
      }
    }

    this.logger.log(`News batch complete: ${generated} generated, ${errors} errors`);
    return { generated, errors };
  }

  /**
   * Search for news/trends using SerpAPI
   */
  private async searchNews(query: string): Promise<NewsSource[]> {
    const serpKey = this.config.get<string>('SERP_API_KEY');
    if (!serpKey) return [];

    try {
      const params = new URLSearchParams({
        q: query,
        api_key: serpKey,
        engine: 'google',
        tbm: 'nws', // News search
        gl: 'tw',
        hl: 'zh-TW',
        num: '5',
      });

      const res = await fetch(`https://serpapi.com/search.json?${params}`);
      if (!res.ok) return [];

      const data = await res.json();
      const results = data.news_results || data.organic_results || [];

      return results.slice(0, 5).map((r: any) => ({
        title: r.title || '',
        snippet: r.snippet || r.description || '',
        url: r.link || '',
        source: r.source?.name || r.source || '',
      }));
    } catch (err) {
      this.logger.warn(`News search failed: ${err}`);
      return [];
    }
  }

  /**
   * Generate an original analysis article from news sources
   */
  private async generateArticle(
    sources: NewsSource[],
    query: string,
  ): Promise<{
    title: string;
    titleEn: string;
    summary: string;
    summaryEn: string;
    category: string;
  } | null> {
    if (!this.openai) return null;

    const sourceSummary = sources
      .map((s, i) => `${i + 1}. [${s.source}] ${s.title}\n   摘要：${s.snippet}\n   連結：${s.url}`)
      .join('\n\n');

    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: `你是 Geovault 的 AI 搜尋趨勢分析師。Geovault 是 APAC 領先的 GEO（Generative Engine Optimization）平台，專門幫助品牌被 ChatGPT、Claude、Perplexity、Gemini、Copilot 等 AI 搜尋引擎主動推薦。

你的任務是根據提供的新聞素材，撰寫一篇原創的趨勢分析文章。

要求：
1. 必須是原創觀點和分析，不是翻譯或摘要
2. 從 GEO（AI 搜尋優化）的角度切入分析
3. 文末要帶出對品牌 AI 能見度的實際建議
4. 繁體中文，專業但易讀
5. 標題要吸引人，有新聞感
6. 內容 600-900 字
7. 使用 Markdown 格式（## 標題、### 子標題、- 列表等）
8. **必須在文章中引用來源文章的連結**，使用 Markdown 連結格式 [來源名稱](URL)，至少引用 2-3 個來源
9. 文末加上「### 參考來源」區塊，列出所有引用的文章連結

回覆格式（JSON）：
{
  "title": "繁體中文標題",
  "titleEn": "English title",
  "summary": "繁體中文完整文章（Markdown 格式，400-600字）",
  "summaryEn": "English summary (2-3 sentences)"
}`,
          },
          {
            role: 'user',
            content: `搜尋主題：${query}\n分類：${category}\n\n相關新聞素材：\n${sourceSummary}\n\n請根據以上素材撰寫一篇原創的 Geovault 趨勢分析文章。`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return {
        title: parsed.title,
        titleEn: parsed.titleEn || '',
        summary: parsed.summary,
        summaryEn: parsed.summaryEn || '',
        category,
      };
    } catch (err) {
      this.logger.error(`AI generation failed: ${err}`);
      return null;
    }
  }
}
