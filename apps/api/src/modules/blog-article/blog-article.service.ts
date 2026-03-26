import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BlogArticleService {
  private readonly logger = new Logger(BlogArticleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
}
