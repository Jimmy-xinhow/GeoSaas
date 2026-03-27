import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';
import { INDUSTRIES } from '@geo-saas/shared';

export type InsightType =
  | 'industry_current_state'
  | 'missing_indicator_focus'
  | 'top_brands_analysis'
  | 'improvement_opportunity';

const INDICATOR_NAMES: Record<string, string> = {
  json_ld: 'JSON-LD',
  llms_txt: 'llms.txt',
  og_tags: 'OG Tags',
  meta_description: 'Meta Description',
  faq_schema: 'FAQ Schema',
  title_optimization: '標題優化',
  contact_info: '聯絡資訊',
  image_alt: '圖片 Alt',
};

@Injectable()
export class IndustryInsightService {
  private readonly logger = new Logger(IndustryInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateInsightArticle(industrySlug: string, insightType: InsightType): Promise<{ slug: string } | null> {
    const data = await this.getIndustryData(industrySlug);
    if (!data || data.totalSites < 5) return null;

    // Check no duplicate in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const existing = await this.prisma.blogArticle.findFirst({
      where: { industrySlug, templateType: insightType, createdAt: { gte: thirtyDaysAgo } },
    });
    if (existing) return null;

    const industryName = this.getIndustryName(industrySlug);
    const prompt = this.buildInsightPrompt(insightType, industryName, data);

    const anthropic = new Anthropic({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY') });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '';
    const titleMap: Record<InsightType, string> = {
      industry_current_state: `${industryName} 行業 AI 搜尋優化現況報告 ${new Date().getFullYear()}`,
      missing_indicator_focus: `為什麼 ${100 - data.weakestIndicators[0].passRate}% 的 ${industryName} 品牌被 AI 忽略`,
      top_brands_analysis: `${industryName} 行業 GEO 標竿品牌分析：他們做了什麼`,
      improvement_opportunity: `${industryName}品牌的 AI 搜尋優化機會：數據告訴你什麼`,
    };

    const slug = `${industrySlug}-${insightType}-${Date.now().toString(36)}`;
    const article = await this.prisma.blogArticle.create({
      data: {
        title: titleMap[insightType],
        slug,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'industry-insight',
        templateType: insightType,
        industrySlug,
        targetKeywords: [industryName, 'GEO 優化', 'AI 搜尋', `${industryName} AI`, insightType.replace(/_/g, ' ')],
        readingTimeMinutes: 5,
        readTime: '5 分鐘',
        published: true,
      },
    });

    this.logger.log(`Generated ${insightType} for ${industryName}: ${slug}`);
    return { slug: article.slug };
  }

  /** Cron: 每週一凌晨 3 點，為每個行業輪流生成一種洞察文章 */
  @Cron('0 3 * * 1', { name: 'weekly-industry-insights' })
  async weeklyInsightGeneration(): Promise<void> {
    this.logger.log('Starting weekly industry insight generation...');

    const industries = await this.prisma.site.groupBy({
      by: ['industry'],
      where: { isPublic: true, industry: { not: null } },
      _count: { id: true },
    });

    const eligible = industries.filter((i) => i.industry && i._count.id >= 5);

    const insightTypes: InsightType[] = [
      'industry_current_state',
      'missing_indicator_focus',
      'top_brands_analysis',
      'improvement_opportunity',
    ];

    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const thisWeekType = insightTypes[weekNumber % insightTypes.length];

    for (const { industry } of eligible) {
      if (!industry) continue;
      try {
        await this.generateInsightArticle(industry, thisWeekType);
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        this.logger.warn(`Failed insight for ${industry}: ${err}`);
      }
    }

    this.logger.log('Weekly insight generation complete');
  }

  /** Generate all insight types for all industries (admin trigger) */
  async generateAll(): Promise<{ generated: number }> {
    const industries = await this.prisma.site.groupBy({
      by: ['industry'],
      where: { isPublic: true, industry: { not: null } },
      _count: { id: true },
    });

    let generated = 0;
    for (const { industry } of industries) {
      if (!industry || industries.find((i) => i.industry === industry && i._count.id < 5)) continue;
      try {
        const result = await this.generateInsightArticle(industry, 'industry_current_state');
        if (result) generated++;
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        this.logger.warn(`Failed: ${industry}: ${err}`);
      }
    }
    return { generated };
  }

  private async getIndustryData(industrySlug: string) {
    const sites = await this.prisma.site.findMany({
      where: { industry: industrySlug, isPublic: true },
      select: {
        bestScore: true,
        tier: true,
        name: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { results: { select: { indicator: true, status: true } } },
        },
      },
      orderBy: { bestScore: 'desc' },
    });

    if (sites.length === 0) return null;

    const scores = sites.map((s) => s.bestScore);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const allScans = sites.map((s) => s.scans[0]).filter(Boolean);

    const indicatorStats: Record<string, { name: string; passRate: number }> = {};
    for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
      const passCount = allScans.filter((scan) =>
        scan.results.some((r) => r.indicator === key && r.status === 'pass'),
      ).length;
      indicatorStats[key] = { name, passRate: allScans.length > 0 ? Math.round((passCount / allScans.length) * 100) : 0 };
    }

    const weakestIndicators = Object.entries(indicatorStats)
      .sort((a, b) => a[1].passRate - b[1].passRate)
      .slice(0, 3)
      .map(([key, val]) => ({ key, name: val.name, passRate: val.passRate }));

    return {
      totalSites: sites.length,
      avgScore,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      levelDistribution: {
        Platinum: sites.filter((s) => s.tier === 'platinum').length,
        Gold: sites.filter((s) => s.tier === 'gold').length,
        Silver: sites.filter((s) => s.tier === 'silver').length,
        Bronze: sites.filter((s) => s.tier === 'bronze').length,
        Unrated: sites.filter((s) => !s.tier).length,
      },
      indicatorStats,
      weakestIndicators,
      topSites: sites.slice(0, 5).map((s) => ({ name: s.name, bestScore: s.bestScore })),
    };
  }

  private getIndustryName(slug: string): string {
    const found = INDUSTRIES.find((i) => i.value === slug);
    return found ? found.label : slug;
  }

  private buildInsightPrompt(type: InsightType, industryName: string, data: NonNullable<Awaited<ReturnType<typeof this.getIndustryData>>>): string {
    const dataContext = `行業：${industryName}
收錄品牌數：${data.totalSites}
平均 GEO 分數：${data.avgScore}/100
最高分：${data.maxScore}，最低分：${data.minScore}

等級分布：
- Platinum：${data.levelDistribution.Platinum}
- Gold：${data.levelDistribution.Gold}
- Silver：${data.levelDistribution.Silver}
- Bronze：${data.levelDistribution.Bronze}
- 未達標：${data.levelDistribution.Unrated}

各指標通過率：
${Object.values(data.indicatorStats).map((v) => `- ${v.name}：${v.passRate}%`).join('\n')}

最常缺少的指標：
${data.weakestIndicators.map((w, i) => `${i + 1}. ${w.name}（僅 ${w.passRate}% 通過）`).join('\n')}

前 5 名品牌：${data.topSites.map((s) => `${s.name}（${s.bestScore}分）`).join('、')}`;

    const prompts: Record<InsightType, string> = {
      industry_current_state: `你是一位產業分析師。請根據以下真實數據，撰寫一篇 900–1100 字的繁體中文行業報告。

${dataContext}

文章結構：
## 執行摘要
## 行業整體現況
## 各指標詳細分析
## 標竿品牌特徵
## 行業機會與風險
## 建議行動
## 常見問題（3 題）

注意：引用具體數字，語氣客觀專業，數據來源標注為「GEO SaaS 平台數據」。`,

      missing_indicator_focus: `你是一位 GEO 技術顧問。請根據以下數據，撰寫一篇 800–1000 字的深度分析文章。

${dataContext}

重點聚焦：${data.weakestIndicators[0].name}（僅 ${data.weakestIndicators[0].passRate}% 通過）

文章結構：
## 為什麼 ${100 - data.weakestIndicators[0].passRate}% 的 ${industryName} 品牌被 AI 忽略
### 現象：驚人的數字
### 原因
### 影響
### 解決方案：如何在 1 天內修復
### 常見問題（3 題）`,

      top_brands_analysis: `你是一位品牌分析師。請根據以下數據，撰寫一篇 800–1000 字的標竿分析文章。

${dataContext}

文章結構：
## ${industryName} 行業 GEO 滿分品牌做了什麼
### 共同特徵
### 具體策略拆解
### 中小品牌可以複製的部分
### 行動建議
### 常見問題（3 題）`,

      improvement_opportunity: `你是一位商業顧問。請根據以下數據，撰寫一篇 900–1100 字的機會分析文章。

${dataContext}

文章結構：
## ${industryName}品牌的 AI 搜尋藍海：數據揭示的三大機會
### 機會一：${data.weakestIndicators[0].name} 幾乎無人做
### 機會二：分數差距代表的競爭空間
### 機會三：先行者優勢
### 如何把握這些機會
### 常見問題（3 題）`,
    };

    return prompts[type];
  }
}
