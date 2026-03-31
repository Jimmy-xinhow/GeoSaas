import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatgptDetector } from '../monitor/platforms/chatgpt.detector';
import { ClaudeDetector } from '../monitor/platforms/claude.detector';
import { PerplexityDetector } from '../monitor/platforms/perplexity.detector';
import { GeminiDetector } from '../monitor/platforms/gemini.detector';
import { CopilotDetector } from '../monitor/platforms/copilot.detector';

const PLATFORMS = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'] as const;
type Platform = (typeof PLATFORMS)[number];

const POSITIVE_KEYWORDS = ['推薦', '值得', '不錯', '優質', '專業', '口碑好', '好評', '首選', '知名', '受歡迎', '滿意', '信賴'];
const NEGATIVE_KEYWORDS = ['不建議', '不推薦', '注意', '小心', '避免', '品質差', '負評', '投訴', '爭議', '問題多'];

@Injectable()
export class IndustryAiService {
  private readonly logger = new Logger(IndustryAiService.name);
  private isRunning = false;

  private readonly detectors: Record<Platform, { detect: (q: string, name: string, url: string) => Promise<{ mentioned: boolean; position: number | null; response: string }> }>;

  constructor(
    private readonly prisma: PrismaService,
    chatgpt: ChatgptDetector,
    claude: ClaudeDetector,
    perplexity: PerplexityDetector,
    gemini: GeminiDetector,
    copilot: CopilotDetector,
  ) {
    this.detectors = {
      CHATGPT: chatgpt,
      CLAUDE: claude,
      PERPLEXITY: perplexity,
      GEMINI: gemini,
      COPILOT: copilot,
    };
  }

  // ─── Helper: get Monday of current ISO week ───
  private getWeekOf(date = new Date()): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ─── Sentiment analysis (keyword-based, zero cost) ───
  analyzeSentiment(text: string, brandName: string): 'positive' | 'neutral' | 'negative' {
    const lower = text.toLowerCase();
    const posCount = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    const negCount = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    // Also check if brand is mentioned (positive signal)
    const mentionsBrand = text.includes(brandName);
    const totalPos = posCount + (mentionsBrand ? 1 : 0);

    if (totalPos > negCount + 1) return 'positive';
    if (negCount > totalPos) return 'negative';
    return 'neutral';
  }

  // ─── Core: Run full industry test ───
  async runIndustryTest(industry: string): Promise<{ tested: number; sites: number }> {
    if (this.isRunning) return { tested: 0, sites: 0 };
    this.isRunning = true;

    try {
      const weekOf = this.getWeekOf();

      // Load queries
      const queries = await this.prisma.industryQuery.findMany({
        where: { industry, isActive: true },
      });
      if (queries.length === 0) {
        this.logger.warn(`No active queries for industry ${industry}`);
        return { tested: 0, sites: 0 };
      }

      // Load sites
      const sites = await this.prisma.site.findMany({
        where: { isPublic: true, industry, bestScore: { gt: 0 } },
        select: { id: true, name: true, url: true },
      });
      if (sites.length === 0) return { tested: 0, sites: 0 };

      this.logger.log(`Running industry AI test: ${industry} — ${queries.length} queries × ${sites.length} sites × ${PLATFORMS.length} platforms`);

      let tested = 0;

      for (const query of queries) {
        const isTemplate = query.question.includes('[品牌名]');

        for (const site of sites) {
          const question = isTemplate
            ? query.question.replace('[品牌名]', site.name)
            : query.question;

          for (const platform of PLATFORMS) {
            try {
              // Check if already tested this week
              const existing = await this.prisma.industryAiResult.findUnique({
                where: {
                  siteId_queryId_platform_weekOf: {
                    siteId: site.id,
                    queryId: query.id,
                    platform,
                    weekOf,
                  },
                },
              });
              if (existing) continue;

              const detector = this.detectors[platform];
              const result = await detector.detect(question, site.name, site.url);
              const sentiment = result.mentioned
                ? this.analyzeSentiment(result.response, site.name)
                : 'neutral';

              await this.prisma.industryAiResult.create({
                data: {
                  siteId: site.id,
                  queryId: query.id,
                  platform,
                  mentioned: result.mentioned,
                  position: result.position,
                  response: result.response?.slice(0, 2000) || '',
                  sentiment,
                  weekOf,
                },
              });

              tested++;
              // Rate limit
              await new Promise((r) => setTimeout(r, 2000));
            } catch (err) {
              this.logger.warn(`Failed ${platform} for ${site.name}: ${err}`);
            }
          }
        }
      }

      // Aggregate snapshots
      await this.aggregateSnapshots(industry, weekOf, sites);

      this.logger.log(`Industry AI test complete: ${industry} — ${tested} results`);
      return { tested, sites: sites.length };
    } finally {
      this.isRunning = false;
    }
  }

  // ─── Aggregate results into snapshots ───
  private async aggregateSnapshots(
    industry: string,
    weekOf: Date,
    sites: { id: string }[],
  ) {
    for (const site of sites) {
      const results = await this.prisma.industryAiResult.findMany({
        where: { siteId: site.id, weekOf },
      });

      if (results.length === 0) continue;

      const validResults = results.filter((r) => !r.response.startsWith('[Error]'));
      const mentionedCount = validResults.filter((r) => r.mentioned).length;
      const totalChecks = validResults.length;
      const mentionRate = totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0;

      const byPlatform: Record<string, { total: number; mentioned: number; rate: number }> = {};
      for (const p of PLATFORMS) {
        const pResults = validResults.filter((r) => r.platform === p);
        const pMentioned = pResults.filter((r) => r.mentioned).length;
        byPlatform[p] = {
          total: pResults.length,
          mentioned: pMentioned,
          rate: pResults.length > 0 ? Math.round((pMentioned / pResults.length) * 100) : 0,
        };
      }

      const sentimentScores = validResults
        .filter((r) => r.sentiment)
        .map((r): number => (r.sentiment === 'positive' ? 1 : r.sentiment === 'negative' ? -1 : 0));
      const avgSentiment = sentimentScores.length > 0
        ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
        : null;

      await this.prisma.industryAiSnapshot.upsert({
        where: { siteId_industry_weekOf: { siteId: site.id, industry, weekOf } },
        create: { siteId: site.id, industry, weekOf, totalChecks, mentionedCount, mentionRate, byPlatform: byPlatform as any, avgSentiment },
        update: { totalChecks, mentionedCount, mentionRate, byPlatform: byPlatform as any, avgSentiment },
      });
    }
  }

  // ─── Feature 1: Brand Impression Page ───
  async getImpressionPage(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, industry: true, bestScore: true, tier: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    const weekOf = this.getWeekOf();
    // Try current week, fall back to last week
    let results = await this.prisma.industryAiResult.findMany({
      where: { siteId, weekOf },
      include: { query: { select: { question: true, category: true } } },
      orderBy: { platform: 'asc' },
    });

    if (results.length === 0) {
      const lastWeek = new Date(weekOf);
      lastWeek.setDate(lastWeek.getDate() - 7);
      results = await this.prisma.industryAiResult.findMany({
        where: { siteId, weekOf: lastWeek },
        include: { query: { select: { question: true, category: true } } },
        orderBy: { platform: 'asc' },
      });
    }

    // Group by platform
    const byPlatform: Record<string, Array<{
      question: string;
      category: string;
      mentioned: boolean;
      position: number | null;
      response: string;
      sentiment: string | null;
    }>> = {};

    for (const r of results) {
      if (!byPlatform[r.platform]) byPlatform[r.platform] = [];
      byPlatform[r.platform].push({
        question: r.query.question.replace('[品牌名]', site.name),
        category: r.query.category,
        mentioned: r.mentioned,
        position: r.position,
        response: r.response,
        sentiment: r.sentiment,
      });
    }

    // Overall stats
    const validResults = results.filter((r) => !r.response.startsWith('[Error]'));
    const mentionedCount = validResults.filter((r) => r.mentioned).length;
    const totalChecks = validResults.length;

    return {
      site,
      overallMentionRate: totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0,
      mentionedCount,
      totalChecks,
      byPlatform,
      weekOf: results[0]?.weekOf || weekOf,
    };
  }

  // ─── Feature 2: Industry Ranking ───
  async getIndustryRanking(industry: string, platform?: string) {
    const weekOf = this.getWeekOf();

    // Try snapshots first
    let snapshots = await this.prisma.industryAiSnapshot.findMany({
      where: { industry, weekOf },
      include: { site: { select: { id: true, name: true, url: true, bestScore: true, tier: true } } },
    });

    if (snapshots.length === 0) {
      const lastWeek = new Date(weekOf);
      lastWeek.setDate(lastWeek.getDate() - 7);
      snapshots = await this.prisma.industryAiSnapshot.findMany({
        where: { industry, weekOf: lastWeek },
        include: { site: { select: { id: true, name: true, url: true, bestScore: true, tier: true } } },
      });
    }

    // If snapshots exist, use them
    if (snapshots.length > 0) {
      let ranked = snapshots.map((s) => {
        const bp = s.byPlatform as Record<string, { total: number; mentioned: number; rate: number }>;
        return {
          ...s.site,
          mentionRate: platform && bp[platform] ? bp[platform].rate : s.mentionRate,
          mentionedCount: s.mentionedCount,
          totalChecks: s.totalChecks,
          byPlatform: bp,
          avgSentiment: s.avgSentiment,
        };
      });
      ranked.sort((a, b) => b.mentionRate - a.mentionRate);
      const avgMentionRate = ranked.length > 0
        ? Math.round(ranked.reduce((sum, r) => sum + r.mentionRate, 0) / ranked.length)
        : 0;
      return { industry, totalBrands: ranked.length, avgMentionRate, weekOf: snapshots[0]?.weekOf || weekOf, ranking: ranked };
    }

    // Fallback: compute ranking from raw results (for when test is still running)
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, industry, bestScore: { gt: 0 } },
      select: { id: true, name: true, url: true, bestScore: true, tier: true },
    });

    const ranked = [];
    for (const site of sites) {
      const results = await this.prisma.industryAiResult.findMany({
        where: { siteId: site.id },
        orderBy: { checkedAt: 'desc' },
      });
      if (results.length === 0) continue;

      const valid = results.filter((r) => !r.response.startsWith('[Error]'));
      const mentionedCount = valid.filter((r) => r.mentioned).length;
      const totalChecks = valid.length;
      const mentionRate = totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0;

      const byPlatform: Record<string, { total: number; mentioned: number; rate: number }> = {};
      for (const p of PLATFORMS) {
        const pResults = valid.filter((r) => r.platform === p);
        const pMentioned = pResults.filter((r) => r.mentioned).length;
        byPlatform[p] = {
          total: pResults.length,
          mentioned: pMentioned,
          rate: pResults.length > 0 ? Math.round((pMentioned / pResults.length) * 100) : 0,
        };
      }

      ranked.push({
        ...site,
        mentionRate: platform && byPlatform[platform] ? byPlatform[platform].rate : mentionRate,
        mentionedCount,
        totalChecks,
        byPlatform,
        avgSentiment: null,
      });
    }

    ranked.sort((a, b) => b.mentionRate - a.mentionRate);
    const avgMentionRate = ranked.length > 0
      ? Math.round(ranked.reduce((sum, r) => sum + r.mentionRate, 0) / ranked.length)
      : 0;

    return { industry, totalBrands: ranked.length, avgMentionRate, weekOf, ranking: ranked };
  }

  // ─── Feature 3: Citation Trend ───
  async getCitationTrend(siteId: string, weeks = 12) {
    const snapshots = await this.prisma.industryAiSnapshot.findMany({
      where: { siteId },
      orderBy: { weekOf: 'desc' },
      take: weeks,
      select: { weekOf: true, mentionRate: true, mentionedCount: true, totalChecks: true, byPlatform: true },
    });

    return snapshots.reverse();
  }

  // ─── Feature 4: Brand Comparison ───
  async runComparison(siteAId: string, siteBId: string): Promise<{ comparisons: number }> {
    const [siteA, siteB] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteAId }, select: { id: true, name: true, url: true, industry: true } }),
      this.prisma.site.findUnique({ where: { id: siteBId }, select: { id: true, name: true, url: true, industry: true } }),
    ]);

    if (!siteA || !siteB) throw new NotFoundException('Site not found');
    const industry = siteA.industry || siteB.industry || '';
    const weekOf = this.getWeekOf();
    let count = 0;

    const industryLabel = industry === 'auto_care' ? '汽車美容' : industry === 'traditional_medicine' ? '整復推拿' : industry;

    for (const platform of PLATFORMS) {
      try {
        const existing = await this.prisma.industryAiComparison.findUnique({
          where: { siteAId_siteBId_platform_weekOf: { siteAId, siteBId, platform, weekOf } },
        });
        if (existing) { count++; continue; }

        const question = `如果要選擇「${siteA.name}」或「${siteB.name}」的${industryLabel}服務，你會推薦哪一個？請詳細比較兩者的優缺點。`;

        const detector = this.detectors[platform];
        const result = await detector.detect(question, siteA.name, siteA.url);

        await this.prisma.industryAiComparison.create({
          data: {
            siteAId,
            siteBId,
            industry,
            platform,
            question,
            response: result.response?.slice(0, 2000) || '',
            weekOf,
          },
        });
        count++;
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        this.logger.warn(`Comparison failed ${platform}: ${err}`);
      }
    }

    return { comparisons: count };
  }

  async getComparison(siteAId: string, siteBId: string) {
    const weekOf = this.getWeekOf();
    let comparisons = await this.prisma.industryAiComparison.findMany({
      where: { siteAId, siteBId, weekOf },
    });

    if (comparisons.length === 0) {
      const lastWeek = new Date(weekOf);
      lastWeek.setDate(lastWeek.getDate() - 7);
      comparisons = await this.prisma.industryAiComparison.findMany({
        where: { siteAId, siteBId, weekOf: lastWeek },
      });
    }

    const [siteA, siteB, snapA, snapB] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: siteAId }, select: { id: true, name: true, url: true, bestScore: true, tier: true, industry: true } }),
      this.prisma.site.findUnique({ where: { id: siteBId }, select: { id: true, name: true, url: true, bestScore: true, tier: true, industry: true } }),
      this.prisma.industryAiSnapshot.findFirst({ where: { siteId: siteAId }, orderBy: { weekOf: 'desc' } }),
      this.prisma.industryAiSnapshot.findFirst({ where: { siteId: siteBId }, orderBy: { weekOf: 'desc' } }),
    ]);

    return {
      siteA: { ...siteA, mentionRate: snapA?.mentionRate || 0, byPlatform: snapA?.byPlatform },
      siteB: { ...siteB, mentionRate: snapB?.mentionRate || 0, byPlatform: snapB?.byPlatform },
      comparisons: comparisons.map((c) => ({
        platform: c.platform,
        question: c.question,
        response: c.response,
      })),
      weekOf: comparisons[0]?.weekOf || weekOf,
    };
  }

  // ─── Admin: Seed queries ───
  async seedQueries(industry: string, queries: { question: string; category: string }[]) {
    let created = 0;
    for (const q of queries) {
      const existing = await this.prisma.industryQuery.findFirst({
        where: { industry, question: q.question },
      });
      if (!existing) {
        await this.prisma.industryQuery.create({
          data: { industry, question: q.question, category: q.category },
        });
        created++;
      }
    }
    return { created };
  }

  async getQueries(industry: string) {
    return this.prisma.industryQuery.findMany({
      where: { industry },
      orderBy: { category: 'asc' },
    });
  }

  // ─── List industry sites with AI data ───
  async getIndustrySites(industry: string) {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, industry, bestScore: { gt: 0 } },
      select: { id: true, name: true, url: true, bestScore: true, tier: true },
      orderBy: { bestScore: 'desc' },
    });

    // Get latest snapshots
    const snapshots = await this.prisma.industryAiSnapshot.findMany({
      where: {
        industry,
        siteId: { in: sites.map((s) => s.id) },
      },
      orderBy: { weekOf: 'desc' },
      distinct: ['siteId'],
    });

    const snapMap = new Map(snapshots.map((s) => [s.siteId, s]));

    return sites.map((s) => ({
      ...s,
      mentionRate: snapMap.get(s.id)?.mentionRate || null,
      mentionedCount: snapMap.get(s.id)?.mentionedCount || null,
    }));
  }

  get running() {
    return this.isRunning;
  }
}
