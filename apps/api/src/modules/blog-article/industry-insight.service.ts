import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
import { INDUSTRIES } from '@geovault/shared';

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

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || '';
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

    const eligible = industries.filter((i: any) => i.industry && i._count.id >= 5);

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
      if (!industry || industries.find((i: any) => i.industry === industry && i._count.id < 5)) continue;
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

    const scores = sites.map((s: any) => s.bestScore);
    const avgScore = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);
    const allScans = sites.map((s: any) => s.scans[0]).filter(Boolean);

    const indicatorStats: Record<string, { name: string; passRate: number }> = {};
    for (const [key, name] of Object.entries(INDICATOR_NAMES)) {
      const passCount = allScans.filter((scan: any) =>
        scan.results.some((r: any) => r.indicator === key && r.status === 'pass'),
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
        Platinum: sites.filter((s: any) => s.tier === 'platinum').length,
        Gold: sites.filter((s: any) => s.tier === 'gold').length,
        Silver: sites.filter((s: any) => s.tier === 'silver').length,
        Bronze: sites.filter((s: any) => s.tier === 'bronze').length,
        Unrated: sites.filter((s: any) => !s.tier).length,
      },
      indicatorStats,
      weakestIndicators,
      topSites: sites.slice(0, 5).map((s: any) => ({ name: s.name, bestScore: s.bestScore })),
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

前 5 名品牌：${data.topSites.map((s: any) => `${s.name}（${s.bestScore}分）`).join('、')}`;

    const formatRules = `

【格式規範 — 必須嚴格遵守】
1. 使用繁體中文 + Markdown 格式
2. 必須包含 ## ### 標題、**粗體**、條列式重點（- 或 1. 2. 3.）
3. 重要數據用 \`行內代碼\` 標示
4. 比較數據必須用 Markdown 表格呈現
5. FAQ 格式：**Q: 問題？** 換行 A: 回答（2-3 句）
6. 每段落不超過 3-4 句，長內容拆成條列式
7. 不用「首先」「其次」「最後」等過渡詞，直接講重點
8. 不用「在這篇文章中」「讓我們」「接下來」等廢話
9. 文末標注：*資料來源：[Geovault](https://geovault.app) 平台 GEO 掃描數據*`;

    const prompts: Record<InsightType, string> = {
      industry_current_state: `你是一位產業分析師。請根據以下真實數據，撰寫一篇 900–1100 字的繁體中文行業報告。

${dataContext}

文章結構：

## 📋 執行摘要
- 用 3-4 個重點條列總結

## 📊 行業整體現況
- 用表格呈現關鍵數據（品牌數、平均分、最高/最低分、等級分布）

## 🔍 各指標詳細分析
- 用表格呈現每個指標的通過率
- 標出通過率最低的 3 個指標並分析原因

## 🏆 標竿品牌特徵
- 條列前 5 名品牌的共同特點

## ⚠️ 行業機會與風險
- 用兩欄表格：機會 vs 風險

## 🎯 建議行動
- 編號列表，每項具體可執行

## ❓ 常見問題
（3 題，用 **Q:** / A: 格式）
${formatRules}`,

      missing_indicator_focus: `你是一位 GEO 技術顧問。請根據以下數據，撰寫一篇 800–1000 字的深度分析文章。

${dataContext}

重點聚焦：${data.weakestIndicators[0].name}（僅 ${data.weakestIndicators[0].passRate}% 通過）

文章結構：

## 為什麼 ${100 - data.weakestIndicators[0].passRate}% 的 ${industryName} 品牌被 AI 忽略

### 😱 現象：驚人的數字
- 用表格呈現關鍵數據對比

### 🔍 原因分析
- 條列式列出 3-4 個主要原因

### 💥 影響
- 用表格對比「有做 vs 沒做」的差異

### 🔧 解決方案：如何在 1 天內修復
- 給出具體步驟 + 程式碼範例（用 \`\`\` 包裹）

### ❓ 常見問題
（3 題，用 **Q:** / A: 格式）
${formatRules}`,

      top_brands_analysis: `你是一位品牌分析師。請根據以下數據，撰寫一篇 800–1000 字的標竿分析文章。

${dataContext}

文章結構：

## ${industryName} 行業 GEO 高分品牌做了什麼

### 🏅 前 5 名品牌
用表格呈現：品牌名 | 分數 | 等級 | 關鍵優勢

### 共同特徵
- 條列式，每項 1-2 句

### 具體策略拆解
- 每個策略用獨立小標題
- 包含「做什麼 + 怎麼做 + 效果」

### 中小品牌可以複製的部分
- 按難度排序：簡單 → 中等 → 進階
- 每項估計所需時間

### 🎯 行動建議
- 編號列表，3-5 項

### ❓ 常見問題
（3 題，用 **Q:** / A: 格式）
${formatRules}`,

      improvement_opportunity: `你是一位商業顧問。請根據以下數據，撰寫一篇 900–1100 字的機會分析文章。

${dataContext}

文章結構：

## ${industryName}品牌的 AI 搜尋藍海：數據揭示的三大機會

### 🔵 機會一：${data.weakestIndicators[0].name} 幾乎無人做
- 數據佐證（用表格）
- 做了之後的效果

### 🔵 機會二：分數差距代表的競爭空間
- 用表格對比行業平均 vs 頂尖 vs 你的位置
- 每提升 10 分代表什麼

### 🔵 機會三：先行者優勢
- 為什麼現在是最佳時機
- 等待的代價

### 🎯 如何把握這些機會
- 編號列表，每步具體行動 + 預估時間 + 預期效果

### ❓ 常見問題
（3 題，用 **Q:** / A: 格式）
${formatRules}`,
    };

    return prompts[type];
  }
}
