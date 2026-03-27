import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogTemplateService, TemplateType } from './blog-template.service';
import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
];

@Injectable()
export class BlogArticleService {
  private readonly logger = new Logger(BlogArticleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly templateService: BlogTemplateService,
  ) {}

  /** List published articles (paginated) */
  async listArticles(params: { page?: number; limit?: number; category?: string; locale?: string }) {
    const { page = 1, limit = 12, category, locale } = params;
    const skip = (page - 1) * limit;

    const where: any = { published: true };
    if (category) where.category = category;
    if (locale) where.locale = locale;

    const [items, total] = await Promise.all([
      this.prisma.blogArticle.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          category: true,
          locale: true,
          readTime: true,
          createdAt: true,
          site: { select: { name: true, url: true, bestScore: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogArticle.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Get a single article by slug */
  async getBySlug(slug: string) {
    return this.prisma.blogArticle.findUnique({
      where: { slug },
      include: { site: { select: { name: true, url: true, bestScore: true, industry: true } } },
    });
  }

  /** Generate an AI analysis article for a public site */
  async generateSiteAnalysis(siteId: string): Promise<{ slug: string }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        isPublic: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            totalScore: true,
            completedAt: true,
            results: { select: { indicator: true, score: true, status: true, suggestion: true } },
          },
        },
        qas: {
          take: 5,
          select: { question: true, answer: true },
        },
      },
    });

    if (!site || !site.isPublic) {
      throw new Error('Site not found or not public');
    }

    const latestScan = site.scans[0];
    const slug = `analysis-${site.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/-+$/, '')}-${Date.now().toString(36)}`;

    // Build article content from real scan data
    const content = this.buildAnalysisContent(site, latestScan);

    const article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title: `${site.name} 的 AI 能見度分析報告`,
        description: `深入分析 ${site.name}（${site.url}）在 AI 搜尋引擎中的能見度表現，GEO 分數 ${site.bestScore}/100，含 8 項指標詳細評估與優化建議。`,
        content,
        category: 'analysis',
        locale: 'zh-TW',
        siteId: site.id,
        readTime: '3 分鐘',
      },
    });

    this.logger.log(`Generated analysis article for ${site.name}: ${slug}`);
    return { slug: article.slug };
  }

  /** Batch generate articles for all public sites that don't have one yet */
  async batchGenerateAnalyses(): Promise<{ generated: number; skipped: number }> {
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        blogArticles: { none: {} },
      },
      select: { id: true },
      take: 20, // process 20 at a time
    });

    let generated = 0;
    let skipped = 0;

    for (const site of sites) {
      try {
        await this.generateSiteAnalysis(site.id);
        generated++;
      } catch (err) {
        this.logger.warn(`Skipping site ${site.id}: ${err}`);
        skipped++;
      }
    }

    return { generated, skipped };
  }

  private buildAnalysisContent(
    site: { name: string; url: string; industry: string | null; bestScore: number; tier: string | null; qas: { question: string; answer: string }[] },
    scan: { totalScore: number; completedAt: Date | null; results: { indicator: string; score: number; status: string; suggestion: string | null }[] } | undefined,
  ): string {
    const indicatorNames: Record<string, string> = {
      json_ld: '結構化資料 (JSON-LD)',
      llms_txt: 'llms.txt',
      og_tags: 'Open Graph 標籤',
      meta_description: 'Meta 描述',
      faq_schema: 'FAQ Schema',
      title_optimization: '標題最佳化',
      contact_info: '聯絡資訊',
      image_alt: '圖片 Alt 文字',
    };

    const scoreLabel = site.bestScore >= 80 ? '優秀' : site.bestScore >= 60 ? '良好' : site.bestScore >= 40 ? '需改善' : '待優化';

    const lines: string[] = [
      `## 概要`,
      '',
      `**${site.name}**（${site.url}）的 GEO 綜合分數為 **${site.bestScore}/100**，評級：**${scoreLabel}**。`,
      site.industry ? `所屬行業：${site.industry}` : '',
      site.tier ? `平台等級：${site.tier.toUpperCase()}` : '',
      '',
    ];

    if (scan && scan.results.length > 0) {
      lines.push('## 8 項 AI 可讀性指標分析', '');
      lines.push('| 指標 | 分數 | 狀態 |');
      lines.push('|------|------|------|');

      for (const r of scan.results) {
        const name = indicatorNames[r.indicator] || r.indicator;
        const statusEmoji = r.status === 'pass' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
        lines.push(`| ${name} | ${r.score} | ${statusEmoji} ${r.status === 'pass' ? '通過' : r.status === 'warning' ? '警告' : '未通過'} |`);
      }
      lines.push('');

      // Highlight issues
      const issues = scan.results.filter((r) => r.status !== 'pass');
      if (issues.length > 0) {
        lines.push('## 需要改善的項目', '');
        for (const issue of issues) {
          const name = indicatorNames[issue.indicator] || issue.indicator;
          lines.push(`### ${name}（${issue.score} 分）`);
          if (issue.suggestion) {
            lines.push('', issue.suggestion);
          }
          lines.push('');
        }
      }

      // Highlight strengths
      const strengths = scan.results.filter((r) => r.status === 'pass');
      if (strengths.length > 0) {
        lines.push('## 表現優秀的項目', '');
        for (const s of strengths) {
          const name = indicatorNames[s.indicator] || s.indicator;
          lines.push(`- **${name}**（${s.score} 分）— 通過`);
        }
        lines.push('');
      }
    }

    if (site.qas.length > 0) {
      lines.push('## 品牌常見問答', '');
      for (const qa of site.qas) {
        lines.push(`**Q: ${qa.question}**`);
        lines.push('', qa.answer, '');
      }
    }

    lines.push(
      '## 如何提升 AI 能見度？',
      '',
      '1. **加入結構化資料（JSON-LD）** — 讓 AI 更容易理解網站內容',
      '2. **建立 llms.txt** — 直接告訴 AI 爬蟲品牌核心資訊',
      '3. **完善 FAQ Schema** — 提供 AI 可直接引用的問答內容',
      '4. **優化 Meta 標籤** — 確保 Open Graph 和 Meta Description 完整',
      '',
      `> 使用 [GEO SaaS](/) 免費掃描您的網站，獲取詳細的 AI 能見度分析報告。`,
    );

    return lines.filter((l) => l !== undefined).join('\n');
  }

  /** Generate template-based AI articles for a site (all missing types) */
  async generateArticlesForSite(siteId: string): Promise<{ generated: string[] }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        isPublic: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            totalScore: true,
            completedAt: true,
            results: { select: { indicator: true, score: true, status: true } },
          },
        },
        blogArticles: { select: { templateType: true } },
      },
    });

    if (!site || !site.isPublic || site.scans.length === 0) {
      return { generated: [] };
    }

    const scan = site.scans[0];
    const existingTypes = new Set(site.blogArticles.map((a) => a.templateType));
    const missingTypes = ALL_TEMPLATE_TYPES.filter((t) => !existingTypes.has(t));

    if (missingTypes.length === 0) return { generated: [] };

    const industryData = site.industry ? await this.getIndustryData(site.industry) : undefined;
    const indicators: Record<string, { score: number; status: string }> = {};
    for (const r of scan.results) {
      indicators[r.indicator] = { score: r.score, status: r.status };
    }

    const tierLabel = site.tier
      ? site.tier.charAt(0).toUpperCase() + site.tier.slice(1)
      : 'Unrated';

    const scanData = {
      geoScore: scan.totalScore,
      level: tierLabel,
      indicators,
      scannedAt: scan.completedAt || new Date(),
    };

    const anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
    const limit = pLimit(2);
    const generated: string[] = [];

    await Promise.all(
      missingTypes.map((templateType) =>
        limit(async () => {
          try {
            const prompt = this.templateService.buildPrompt(
              templateType,
              { name: site.name, url: site.url, industry: site.industry || undefined },
              scanData,
              industryData,
            );

            const message = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2000,
              messages: [{ role: 'user', content: prompt }],
            });

            const content = message.content[0].type === 'text' ? message.content[0].text : '';
            const title = this.extractTitle(content, site.name, templateType);
            const slug = `${site.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 30)}-${templateType}-${Date.now().toString(36)}`;

            await this.prisma.blogArticle.create({
              data: {
                slug,
                title,
                description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
                content,
                category: 'analysis',
                siteId: site.id,
                templateType,
                industrySlug: site.industry || undefined,
                targetKeywords: this.templateService.getTargetKeywords(templateType, {
                  name: site.name,
                  url: site.url,
                  industry: site.industry || undefined,
                }),
                readingTimeMinutes: this.templateService.estimateReadingTime(templateType),
                readTime: `${this.templateService.estimateReadingTime(templateType)} 分鐘`,
                published: true,
              },
            });

            generated.push(templateType);
            this.logger.log(`Generated ${templateType} article for ${site.name}`);
          } catch (err) {
            this.logger.warn(`Failed to generate ${templateType} for ${site.name}: ${err}`);
          }
        }),
      ),
    );

    return { generated };
  }

  /** Cron: 每天凌晨 2 點批量補齊文章 */
  @Cron('0 2 * * *', { name: 'blog-bulk-generation' })
  async scheduledBulkGeneration(): Promise<void> {
    this.logger.log('Starting scheduled blog bulk generation...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        scans: { some: { status: 'COMPLETED', completedAt: { gte: sevenDaysAgo } } },
      },
      select: {
        id: true,
        _count: { select: { blogArticles: true } },
      },
    });

    const needArticles = sites.filter((s) => s._count.blogArticles < 3);
    const limit = pLimit(3);

    await Promise.all(
      needArticles.map((s) => limit(() => this.generateArticlesForSite(s.id))),
    );

    this.logger.log(`Bulk generation complete: processed ${needArticles.length} sites`);
  }

  private extractTitle(content: string, siteName: string, type: TemplateType): string {
    const match = content.match(/^#{1,2}\s+(.+)$/m);
    if (match) return match[1].trim();
    const fallbacks: Record<TemplateType, string> = {
      geo_overview: `${siteName} 的 AI 搜尋能見度全面分析`,
      score_breakdown: `${siteName} GEO 8 項指標深度解析`,
      competitor_comparison: `${siteName} 的 AI 搜尋競爭力分析`,
      improvement_tips: `${siteName} GEO 優化實作指南`,
      industry_benchmark: `${siteName} 行業 AI 搜尋基準報告`,
    };
    return fallbacks[type];
  }

  private async getIndustryData(industry: string) {
    const result = await this.prisma.site.aggregate({
      where: { industry, isPublic: true },
      _avg: { bestScore: true },
      _count: { id: true },
    });
    return {
      avgScore: Math.round(result._avg.bestScore ?? 0),
      totalSites: result._count.id,
    };
  }
}
