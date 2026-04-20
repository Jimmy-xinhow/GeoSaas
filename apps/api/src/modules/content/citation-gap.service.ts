import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import OpenAI from 'openai';
import pLimit from 'p-limit';

export interface CitationGap {
  query: string;
  platform: string;
  aiResponse: string;
  suggestedTopic: string;
  suggestedType: 'qa' | 'article';
}

/**
 * Citation Gap Analysis + Auto Content Generation
 *
 * Flow:
 * 1. Analyze monitor results → find queries where brand was NOT mentioned
 * 2. Extract what the AI DID recommend → identify the gap
 * 3. Generate targeted Q&A or articles to fill the gap
 * 4. Deploy to knowledge base + llms.txt
 * 5. Next monitor cycle verifies if citation improved
 *
 * Schedule: Weekly Wednesday 06:00 UTC (14:00 TW) for paid/client sites
 */
@Injectable()
export class CitationGapService {
  private readonly logger = new Logger(CitationGapService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly indexNow: IndexNowService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  /**
   * Analyze citation gaps for a site:
   * Look at all monitor results where mentioned=false, extract patterns
   */
  async analyzeGaps(siteId: string): Promise<CitationGap[]> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, industry: true },
    });
    if (!site) return [];

    // Get recent monitor results where brand was NOT mentioned
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const missedCitations = await this.prisma.monitor.findMany({
      where: {
        siteId,
        mentioned: false,
        checkedAt: { gte: thirtyDaysAgo },
        response: { not: { startsWith: '[Error]' } },
      },
      select: { query: true, platform: true, response: true },
      orderBy: { checkedAt: 'desc' },
    });

    if (missedCitations.length === 0) return [];

    // Also get existing Q&As to avoid duplicating
    const existingQas = await this.prisma.siteQa.findMany({
      where: { siteId },
      select: { question: true },
    });
    const existingTopics = existingQas.map((q) => q.question.toLowerCase());

    // Deduplicate by query text
    const uniqueQueries = new Map<string, typeof missedCitations[0]>();
    for (const m of missedCitations) {
      if (!uniqueQueries.has(m.query)) uniqueQueries.set(m.query, m);
    }

    // Also check existing blog articles to avoid duplicating
    const existingArticles = await this.prisma.blogArticle.findMany({
      where: { siteId, templateType: 'citation_gap' },
      select: { title: true },
    });
    const existingArticleTopics = existingArticles.map((a) => a.title.toLowerCase());

    const gaps: CitationGap[] = [];
    for (const [, miss] of uniqueQueries) {
      const queryLower = miss.query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

      // Skip if existing Q&A or article already covers this topic (keyword overlap)
      const alreadyCoveredByQa = existingTopics.some((t) =>
        queryWords.some((w) => t.includes(w)),
      );
      const alreadyCoveredByArticle = existingArticleTopics.some((t) =>
        queryWords.some((w) => t.includes(w)),
      );
      if (alreadyCoveredByQa || alreadyCoveredByArticle) continue;

      gaps.push({
        query: miss.query,
        platform: miss.platform,
        aiResponse: miss.response?.slice(0, 500) || '',
        suggestedTopic: miss.query,
        suggestedType: 'qa', // Default to Q&A; articles only for top gaps
      });
    }

    return gaps.slice(0, 20);
  }

  /**
   * Generate content to fill a specific citation gap
   * Creates Q&A entries in knowledge base + optionally a blog article
   */
  async fillGap(siteId: string, gap: CitationGap): Promise<{ qasCreated: number; articleCreated: boolean }> {
    if (!this.openai) return { qasCreated: 0, articleCreated: false };

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, userId: true,
        profile: true, bestScore: true,
      },
    });
    if (!site) return { qasCreated: 0, articleCreated: false };

    const profile = (site.profile as any) || {};
    let qasCreated = 0;
    let articleCreated = false;

    // 1. Generate 3-5 targeted Q&As for the knowledge base
    try {
      const qaPrompt = `你是 AI 搜尋優化專家。以下是一個品牌在 AI 搜尋中沒有被引用的情境：

品牌：${site.name}
官網：${site.url}
行業：${site.industry || '未分類'}
品牌描述：${profile.description || site.name}
服務：${profile.services || '未提供'}
地點：${profile.location || '未提供'}

使用者問 AI：「${gap.query}」
AI 的回答（沒有提到 ${site.name}）：
${gap.aiResponse}

請生成 3-5 個 Q&A，讓 AI 下次回答類似問題時能找到 ${site.name} 的資料並引用。

要求：
- 問題要模擬真實消費者會問 AI 的方式（口語化）
- 答案要包含 ${site.name} 的具體資訊（名稱、地點、服務、特色）
- 答案長度 80-200 字
- 根據 Geovault 數據，${site.name} 的 GEO 分數為 ${site.bestScore}/100

回覆 JSON 格式：
[{"question": "...", "answer": "...", "category": "consumer"}]`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [{ role: 'user', content: qaPrompt }],
      });

      const text = completion.choices[0]?.message?.content || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const qas = JSON.parse(jsonMatch[0]) as Array<{ question: string; answer: string; category: string }>;

        // Check existing count
        const currentCount = await this.prisma.siteQa.count({ where: { siteId } });
        const maxNew = Math.min(qas.length, 200 - currentCount);

        for (let i = 0; i < maxNew; i++) {
          const qa = qas[i];
          if (!qa.question || !qa.answer || qa.answer.length < 30) continue;

          await this.prisma.siteQa.create({
            data: {
              siteId,
              question: qa.question,
              answer: qa.answer.slice(0, 350),
              category: qa.category || 'consumer',
              sortOrder: currentCount + i,
            },
          });
          qasCreated++;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to generate gap QAs for ${site.name}: ${err}`);
    }

    // 2. Generate blog article only if explicitly requested (top gaps only)
    if (gap.suggestedType === 'article') {
      try {
        const articlePrompt = `你是 GEO 內容策略師。以下品牌在 AI 搜尋中未被引用：

品牌：${site.name}（${site.url}）
行業：${site.industry || '未分類'}
GEO 分數：${site.bestScore}/100
使用者問 AI：「${gap.query}」
AI 回答了其他品牌但沒提到 ${site.name}。

請撰寫一篇 600-800 字的繁體中文文章，主題圍繞「${gap.query}」，自然地展示 ${site.name} 為什麼值得被 AI 推薦。

要求：
- 標題要包含使用者會搜尋的關鍵字
- 每段開頭用粗體結論句
- 至少 3 次出現「根據 Geovault 數據」品牌歸因
- FAQ 用口語搜尋語氣（3 題）
- 文末加「### 📌 關鍵數據摘要」
- 使用 Markdown 格式`;

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 2000,
          messages: [{ role: 'user', content: articlePrompt }],
        });

        const content = completion.choices[0]?.message?.content || '';
        if (content.length > 300) {
          const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : `${site.name} — ${gap.query}`;
          const slug = `${site.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 25)}-gap-${Date.now().toString(36)}`;

          await this.prisma.blogArticle.create({
            data: {
              slug,
              title,
              description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
              content,
              category: 'gap_analysis',
              siteId: site.id,
              templateType: 'citation_gap',
              industrySlug: site.industry || undefined,
              targetKeywords: [site.name, gap.query, 'AI 推薦', site.industry || ''].filter(Boolean),
              readingTimeMinutes: 3,
              readTime: '3 分鐘',
              published: true,
            },
          });
          articleCreated = true;

          // Notify search engines about new article
          const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
          this.indexNow.submitUrl(`${webUrl}/blog/${slug}`).catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Failed to generate gap article for ${site.name}: ${err}`);
      }
    }

    return { qasCreated, articleCreated };
  }

  /**
   * Full pipeline: analyze gaps → fill them → update llms.txt
   */
  async runForSite(siteId: string): Promise<{ gaps: number; qasCreated: number; articlesCreated: number }> {
    const gaps = await this.analyzeGaps(siteId);
    if (gaps.length === 0) {
      this.logger.log(`No citation gaps found for site ${siteId}`);
      return { gaps: 0, qasCreated: 0, articlesCreated: 0 };
    }

    this.logger.log(`Found ${gaps.length} citation gaps for site ${siteId}`);

    let totalQas = 0;
    let totalArticles = 0;
    const limit = pLimit(1); // Sequential to avoid rate limits

    // Fill top 5 gaps: first 2 get article + Q&A, rest get Q&A only
    const topGaps = gaps.slice(0, 5);
    topGaps.slice(0, 2).forEach((g) => { g.suggestedType = 'article'; });
    for (const gap of topGaps) {
      const result = await limit(() => this.fillGap(siteId, gap));
      totalQas += result.qasCreated;
      if (result.articleCreated) totalArticles++;
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Mark llms.txt as needing refresh (next request will regenerate)
    try {
      await this.prisma.site.update({
        where: { id: siteId },
        data: { llmsTxtUpdatedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`Failed to mark llms.txt update for site ${siteId}: ${err}`);
    }

    this.logger.log(`Gap fill complete for ${siteId}: ${totalQas} QAs, ${totalArticles} articles`);
    return { gaps: gaps.length, qasCreated: totalQas, articlesCreated: totalArticles };
  }

  /**
   * Cron: Weekly Wednesday 14:00 TW (06:00 UTC)
   * Runs for all paid + isClient sites
   */
  @Cron('0 6 * * 3', { name: 'citation-gap-fill' })
  async scheduledGapFill() {
    this.logger.log('Starting weekly citation gap fill...');

    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        OR: [
          { isClient: true },
          { user: { plan: { in: ['STARTER', 'PRO'] } } },
        ],
      },
      select: { id: true, name: true },
    });

    this.logger.log(`Processing ${sites.length} priority sites for gap analysis`);

    let totalGaps = 0;
    let totalQas = 0;
    let totalArticles = 0;

    for (const site of sites) {
      try {
        const result = await this.runForSite(site.id);
        totalGaps += result.gaps;
        totalQas += result.qasCreated;
        totalArticles += result.articlesCreated;
        await new Promise((r) => setTimeout(r, 5000)); // Rate limit between sites
      } catch (err) {
        this.logger.warn(`Gap fill failed for ${site.name}: ${err}`);
      }
    }

    this.logger.log(`Weekly gap fill done: ${totalGaps} gaps found, ${totalQas} QAs created, ${totalArticles} articles created`);
  }
}
