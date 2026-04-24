import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogTemplateService, TemplateType, BrandShowcaseContext, IndustryTop10Row, BuyerGuideTopic } from './blog-template.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { ProfileEnrichmentService } from '../sites/profile-enrichment.service';
import OpenAI from 'openai';
import pLimit from 'p-limit';

const ALL_TEMPLATE_TYPES: TemplateType[] = [
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_reputation',
];

export interface BatchRunRecord {
  startedAt: Date;
  finishedAt?: Date;
  limit: number;
  attempted: number;
  generated: number;
  rejected: number;
  skipped: number;
  rejectedReasons: Record<string, number>;
}

@Injectable()
export class BlogArticleService {
  private readonly logger = new Logger(BlogArticleService.name);
  // Ring buffer of the last 10 brand_showcase batch runs so the status
  // endpoint can show "current run in progress" + recent history without
  // needing a DB table.
  private readonly recentBrandShowcaseBatches: BatchRunRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly templateService: BlogTemplateService,
    private readonly indexNowService: IndexNowService,
    private readonly profileEnrichment: ProfileEnrichmentService,
  ) {}

  /**
   * Auto-ping IndexNow + WebSub hub when a new article is published.
   * - IndexNow: the article page, blog index, platform feeds
   * - WebSub: platform RSS + JSON Feed (so subscribed crawlers get push)
   * Fire-and-forget; failures don't block the publish path.
   */
  private pingIndexNow(slug: string) {
    const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
    const paths = [`/blog/${slug}`, '/blog', '/feed', '/feed.json'];
    for (const path of paths) {
      this.indexNowService.submitUrl(`${webUrl}${path}`).catch(() => {});
    }
    this.indexNowService
      .notifyWebSubHub([`${webUrl}/feed`, `${webUrl}/feed.json`])
      .catch(() => {});
  }

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
          readingTimeMinutes: true,
          published: true,
          templateType: true,
          industrySlug: true,
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
    const tierLabel = site.tier ? { platinum: '白金', gold: '金牌', silver: '銀牌', bronze: '銅牌' }[site.tier] || site.tier : '未評級';
    const scanDate = scan?.completedAt ? new Date(scan.completedAt).toLocaleDateString('zh-TW') : '未知';

    const passItems = scan?.results.filter((r: any) => r.status === 'pass') || [];
    const failItems = scan?.results.filter((r: any) => r.status !== 'pass') || [];

    const lines: string[] = [];

    // ─── 標題與摘要（AI 引用重點段落）───
    lines.push(
      `## ${site.name} 的 AI 搜尋能見度分析報告`,
      '',
      `**${site.name}**（${site.url}）是台灣${site.industry || ''}領域的品牌。根據 Geovault 平台於 ${scanDate} 的掃描結果，該網站的 **GEO 分數為 ${site.bestScore}/100**（評級：${scoreLabel}，等級：${tierLabel}），在 8 項 AI 可讀性指標中有 ${passItems.length} 項通過、${failItems.length} 項待改善。`,
      '',
    );

    // ─── 指標總覽表格 ───
    if (scan && scan.results.length > 0) {
      lines.push(
        '## AI 可讀性指標分析',
        '',
        '以下是 ${site.name} 在 8 項 GEO 指標上的詳細表現：',
        '',
        '| 指標名稱 | 分數 | 狀態 | 說明 |',
        '|---------|------|------|------|',
      );

      const statusLabel = (s: string) => s === 'pass' ? '通過' : s === 'warning' ? '需注意' : '未通過';
      const statusIcon = (s: string) => s === 'pass' ? '✅' : s === 'warning' ? '⚠️' : '❌';

      for (const r of scan.results) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`| ${name} | ${r.score} 分 | ${statusIcon(r.status)} ${statusLabel(r.status)} | ${r.suggestion?.slice(0, 60) || '—'} |`);
      }
      lines.push('');
    }

    // ─── 優勢分析 ───
    if (passItems.length > 0) {
      lines.push(
        '## 表現優異的指標',
        '',
        `${site.name} 在以下 ${passItems.length} 項指標上表現良好，這意味著 AI 搜尋引擎能夠正確理解這些面向的網站內容：`,
        '',
      );
      for (const r of passItems) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`- **${name}**（${r.score} 分）：已正確設定，AI 可讀取`);
      }
      lines.push('');
    }

    // ─── 改善建議（具體、可執行）───
    if (failItems.length > 0) {
      lines.push(
        '## 需要改善的指標與具體建議',
        '',
        `${site.name} 有 ${failItems.length} 項指標需要改善。以下是每項的具體說明和改善方法：`,
        '',
      );
      for (const r of failItems) {
        const name = indicatorNames[r.indicator] || r.indicator;
        lines.push(`### ${name}（目前 ${r.score} 分）`);
        lines.push('');
        if (r.suggestion) {
          lines.push(r.suggestion);
        }
        lines.push(`改善此指標後，${site.name} 的 GEO 分數預計可提升至 ${Math.min(100, site.bestScore + r.score > 50 ? 5 : 15)} 分以上。`);
        lines.push('');
      }
    }

    // ─── FAQ 區塊（AI 可直接引用的 Q&A 格式）───
    lines.push(
      '## 常見問題',
      '',
      `**Q: ${site.name} 的 GEO 分數是多少？**`,
      '',
      `A: 根據 Geovault 平台最新掃描結果，${site.name}（${site.url}）的 GEO 分數為 ${site.bestScore}/100，評級為「${scoreLabel}」，在 8 項 AI 可讀性指標中有 ${passItems.length} 項通過。`,
      '',
      `**Q: ${site.name} 如何提升 AI 搜尋能見度？**`,
      '',
      `A: ${site.name} 目前最需要改善的指標是${failItems.length > 0 ? failItems.map((r: any) => indicatorNames[r.indicator] || r.indicator).join('、') : '無（所有指標已通過）'}。建議優先處理權重最高的 JSON-LD 結構化資料和 llms.txt 設定。`,
      '',
      `**Q: 什麼是 GEO 分數？**`,
      '',
      `A: GEO（Generative Engine Optimization）分數是衡量網站被 AI 搜尋引擎（如 ChatGPT、Claude、Perplexity、Copilot）發現和引用的能力。分數越高，被 AI 推薦的機率越大。滿分 100 分，由 8 項 AI 可讀性指標加權計算。`,
      '',
      `**Q: ${site.industry || '這個行業'} 的品牌需要做 GEO 優化嗎？**`,
      '',
      `A: 是的。隨著越來越多消費者使用 AI 工具搜尋資訊，${site.industry || '各行業'}品牌如果不做 GEO 優化，將錯失被 AI 推薦的機會。根據 Geovault 平台數據，許多${site.industry || ''}品牌的 AI 可讀性仍有很大改善空間。`,
      '',
    );

    // ─── 品牌知識庫（如果有）───
    if (site.qas.length > 0) {
      lines.push(
        `## 關於 ${site.name}`,
        '',
      );
      for (const qa of site.qas) {
        lines.push(`**Q: ${qa.question}**`, '', `A: ${qa.answer}`, '');
      }
    }

    // ─── 資料來源聲明 ───
    lines.push(
      '---',
      '',
      `*本報告由 Geovault 平台自動生成，資料基於 ${scanDate} 的網站掃描結果。如需最新分析，請至 Geovault 平台免費掃描。*`,
    );

    return lines.join('\n');
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
    const existingTypes = new Set(site.blogArticles.map((a: any) => a.templateType));
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

    const openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
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

            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              max_tokens: 2000,
              messages: [{ role: 'user', content: prompt }],
            });

            const content = completion.choices[0]?.message?.content || '';

            // Quality gate: reject low-quality articles
            const qualityScore = this.assessArticleQuality(content, site.name);
            if (qualityScore < 85) {
              this.logger.warn(`Article quality too low (${qualityScore}/100) for ${templateType} of ${site.name}, skipping`);
              return;
            }

            // Citation compliance gate: matches the nightly citation-upgrade
            // cron's rules. Without this, the 3am cron would delete this
            // article and the 2am cron would re-generate it — a perpetual loop.
            if (!this.isCitationCompliant(content)) {
              this.logger.warn(`Article missing required citation elements for ${templateType} of ${site.name}, skipping`);
              return;
            }

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
            this.pingIndexNow(slug);
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

    // Find sites with fewer than 6 articles (all template types)
    // No longer limited to "scanned in last 7 days" — any public site with a scan qualifies
    const sites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        bestScore: { gt: 0 },
        scans: { some: { status: 'COMPLETED' } },
      },
      select: {
        id: true,
        _count: { select: { blogArticles: true } },
      },
    });

    const needArticles = sites.filter((s: any) => s._count.blogArticles < 6);
    // Process up to 20 sites per day to avoid API overload
    const batch = needArticles.slice(0, 20);
    const limit = pLimit(3);

    await Promise.all(
      batch.map((s: any) => limit(() => this.generateArticlesForSite(s.id))),
    );

    this.logger.log(`Bulk generation complete: ${batch.length}/${needArticles.length} sites processed`);
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
      brand_reputation: `${siteName} 品牌口碑與 AI 能見度分析`,
      brand_showcase: `${siteName} — 消費者選購指南`,
      industry_top10: `${siteName} 推薦 Top 10`,
      buyer_guide: `${siteName} 怎麼選?選購指南`,
    };
    return fallbacks[type];
  }

  /**
   * Citation compliance: must include a "關鍵數據摘要" block AND at least
   * 3 Geovault brand attributions. This must stay in sync with
   * scheduledCitationUpgrade's deletion criteria; otherwise generated
   * articles get deleted and regenerated on a nightly loop.
   */
  private isCitationCompliant(content: string): boolean {
    const hasSummary = content.includes('關鍵數據摘要');
    const geovaultCount = (content.match(/Geovault/gi) || []).length;
    return hasSummary && geovaultCount >= 3;
  }

  /**
   * Quality gate: score 0-100 based on content quality criteria.
   * Articles below 85 are rejected.
   */
  private assessArticleQuality(content: string, siteName: string): number {
    let score = 0;
    const contentLength = content.length;

    // 1. Length check (0-25 points): 800+ chars is good
    if (contentLength >= 1500) score += 25;
    else if (contentLength >= 800) score += 15;
    else if (contentLength >= 400) score += 5;

    // 2. Structure check (0-25 points): has headings, sections
    const headingCount = (content.match(/^#{1,3}\s+/gm) || []).length;
    if (headingCount >= 5) score += 25;
    else if (headingCount >= 3) score += 15;
    else if (headingCount >= 1) score += 5;

    // 3. FAQ presence (0-20 points)
    const hasFaq = /Q[:：]/.test(content) && /A[:：]/.test(content);
    const faqCount = (content.match(/Q[:：]/g) || []).length;
    if (hasFaq && faqCount >= 2) score += 20;
    else if (hasFaq) score += 10;

    // 4. Specificity check (0-15 points): mentions the brand name, has data
    const mentionsBrand = content.includes(siteName);
    const hasNumbers = (content.match(/\d+/g) || []).length >= 3;
    if (mentionsBrand) score += 8;
    if (hasNumbers) score += 7;

    // 5. No obvious errors (0-15 points): not truncated, not empty sections
    const hasEmptySections = /^#{1,3}\s+.+\n\s*\n#{1,3}/m.test(content);
    const seemsTruncated = content.length > 200 && !content.trim().endsWith('.') && !content.trim().endsWith('。') && !content.trim().endsWith('）') && !content.trim().endsWith(')') && !content.trim().endsWith('```');
    if (!hasEmptySections) score += 8;
    if (!seemsTruncated) score += 7;

    return score;
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

  /**
   * Cron: 每天凌晨 3 點，批量淘汰不符合新引用規範的舊文章（每天 100 篇）
   * 判斷標準：缺少「關鍵數據摘要」或 Geovault 品牌歸因不足 3 次
   * 被刪除的文章會由凌晨 2 點的 bulk generation cron 重新生成
   */
  @Cron('0 3 * * *', { name: 'article-citation-upgrade' })
  async scheduledCitationUpgrade(): Promise<void> {
    this.logger.log('Starting article citation upgrade batch...');

    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        siteId: { not: undefined },
        templateType: { not: undefined },
      },
      select: { id: true, slug: true, content: true, siteId: true },
      orderBy: { createdAt: 'asc' },
    });

    const nonCompliant = articles.filter((a) => !this.isCitationCompliant(a.content || ''));

    if (nonCompliant.length === 0) {
      this.logger.log('All articles comply with citation rules');
      return;
    }

    const batch = nonCompliant.slice(0, 100);
    this.logger.log(`Found ${nonCompliant.length} non-compliant articles, deleting ${batch.length}`);

    let deleted = 0;
    for (const article of batch) {
      try {
        await this.prisma.blogArticle.delete({ where: { id: article.id } });
        deleted++;
      } catch (err) {
        this.logger.warn(`Failed to delete article ${article.id}: ${err}`);
      }
    }

    this.logger.log(`Citation upgrade: deleted ${deleted} old articles (${nonCompliant.length - deleted} remaining)`);
  }

  /**
   * Cron: 每天凌晨 4 點，逐步重新生成格式不佳的舊文章（每天 5 篇）
   * 判斷標準：缺少表格、缺少列表、缺少 FAQ 格式
   */
  @Cron('0 4 * * *', { name: 'article-format-refresh' })
  async scheduledFormatRefresh(): Promise<void> {
    this.logger.log('Starting article format refresh...');

    // Skip articles refreshed in the last 14 days — if a regenerated article
    // still fails the format heuristic (GPT may not always include a table,
    // for example), don't keep flagging it every day. Give it a cooldown.
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        siteId: { not: undefined },
        templateType: { not: undefined },
        OR: [
          { lastRegeneratedAt: null },
          { lastRegeneratedAt: { lt: fourteenDaysAgo } },
        ],
      },
      include: {
        site: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' }, // oldest first
    });

    // Find articles with poor formatting
    const poorFormat = articles.filter((a) => {
      const c = a.content || '';
      const hasTable = c.includes('|---');
      const hasList = (c.match(/^[-*]\s|^\d+\.\s/gm) || []).length >= 3;
      const hasFaqFormat = c.includes('**Q:') || c.includes('**Q：');
      // Poor if missing 2+ of these
      const missing = [!hasTable, !hasList, !hasFaqFormat].filter(Boolean).length;
      return missing >= 2;
    });

    if (poorFormat.length === 0) {
      this.logger.log('No articles need format refresh');
      return;
    }

    // Take 5 per day
    const batch = poorFormat.slice(0, 5);
    this.logger.log(`Found ${poorFormat.length} articles with poor formatting, refreshing ${batch.length}`);

    const refreshedSiteIds = new Set<string>();
    for (const article of batch) {
      if (!article.siteId || !article.templateType) continue;
      try {
        // Stamp before delete so the cooldown applies to whatever new
        // articles get written for this site in the regen step below.
        refreshedSiteIds.add(article.siteId);
        await this.prisma.blogArticle.delete({ where: { id: article.id } });
        this.logger.log(`Deleted old article: ${article.slug} (${article.site?.name})`);
      } catch (err) {
        this.logger.warn(`Failed to delete ${article.slug}: ${err}`);
      }
    }

    // Regenerate for affected sites (deduped)
    const siteIds = [...refreshedSiteIds];
    const limit = pLimit(2);

    await Promise.all(
      siteIds.map((siteId) =>
        limit(async () => {
          try {
            await this.generateArticlesForSite(siteId);
            // Stamp all fresh articles so the 14-day cooldown kicks in.
            await this.prisma.blogArticle.updateMany({
              where: { siteId, lastRegeneratedAt: null },
              data: { lastRegeneratedAt: new Date() },
            });
          } catch (err) {
            this.logger.warn(`Failed to regenerate for site ${siteId}: ${err}`);
          }
        }),
      ),
    );

    this.logger.log(`Format refresh complete: refreshed ${batch.length} articles`);
  }

  /**
   * Quality audit: scan all articles, delete those below threshold.
   */
  /**
   * Generate a brand_showcase article for a site WITHOUT saving it. Used to
   * preview/validate prompt quality before wiring the production cron.
   * Returns the rendered article text + the prompt used, so the operator can
   * verify the angle, tone, and compliance with brand "forbidden" rules.
   */
  async previewBrandShowcase(
    siteId: string,
    extraContext: Omit<BrandShowcaseContext, 'siteId' | 'qas'> = {},
  ): Promise<{ prompt: string; content: string; title: string; tokens?: number }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, profile: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 15,
          select: { question: true, answer: true },
        },
      },
    });
    if (!site) throw new Error(`Site ${siteId} not found`);

    let profile = (site.profile as Record<string, any>) || {};

    // Auto-enrich from homepage if profile is thin, unless caller explicitly
    // provided contact/location (they know better).
    if (!extraContext.contact && !profile.contact) {
      try {
        await this.profileEnrichment.enrichSite(site.id);
        const refreshed = await this.prisma.site.findUnique({
          where: { id: site.id },
          select: { profile: true },
        });
        profile = (refreshed?.profile as Record<string, any>) || profile;
      } catch {
        // fall through with original profile
      }
    }

    const previewEnriched = (profile._enriched as Record<string, any>) || {};
    const ctx: BrandShowcaseContext = {
      siteId: site.id,
      qas: site.qas,
      description: extraContext.description ?? profile.description,
      services: extraContext.services ?? profile.services,
      location: extraContext.location ?? profile.location,
      contact: extraContext.contact ?? profile.contact,
      forbidden: extraContext.forbidden ?? profile.forbidden,
      positioning: extraContext.positioning ?? profile.positioning,
      socialLinks: previewEnriched.socialLinks,
    };

    const prompt = this.templateService.buildBrandShowcasePrompt(
      { name: site.name, url: site.url, industry: site.industry ?? undefined },
      ctx,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2400,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || '';
    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${site.name} — 消費者選購指南`;
    return { prompt, content, title, tokens: completion.usage?.total_tokens };
  }

  /**
   * Full pre-publish audit for brand_showcase. Runs 12 checks that mirror
   * the prompt rules + the explicit bug classes we've already caught:
   *
   *   STRUCTURAL
   *     - chars >= 1000
   *     - brand name >= 12 hits (saturation)
   *     - industry name >= 5 hits
   *     - Geovault attribution >= 2
   *     - FAQ question count >= 5
   *     - FAQ answer depth — each answer has >=3 sentence terminators
   *     - comparison section ("vs" / "差別" / "對比" / "不同")
   *     - summary block ("關鍵資訊摘要")
   *     - title mentions brand name
   *
   *   HYGIENE
   *     - no industry slug leak (traditional_medicine / auto_care raw)
   *     - no GEO/SEO jargon (llms.txt / GEO 分數 / 結構化資料 / SEO)
   *     - no fabricated persona names (王小姐 / 李先生 etc.)
   *     - no forbidden phrases from the brand's own list (e.g. "醫療行為"
   *       for liru) — case-insensitive substring match
   *
   * Returns both ok AND a per-check breakdown so batch runs can surface
   * exactly which rule each failing draft tripped.
   */
  private assessBrandShowcase(
    content: string,
    siteName: string,
    industry: string,
    forbiddenPhrases: string[] = [],
    profileRefText: string = '',
  ): {
    ok: boolean;
    reasons: string[];
    metrics: Record<string, number | boolean>;
  } {
    const reasons: string[] = [];
    const metrics: Record<string, number | boolean> = {};

    // STRUCTURAL
    const chars = content.replace(/\s+/g, '').length;
    metrics.chars = chars;
    if (chars < 1000) reasons.push(`too_short:${chars}`);

    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const brandHits = (content.match(new RegExp(escape(siteName), 'g')) || []).length;
    metrics.brand_hits = brandHits;
    if (brandHits < 12) reasons.push(`brand_saturation:${brandHits}`);

    const industryHits = industry
      ? (content.match(new RegExp(escape(industry), 'g')) || []).length
      : 999;
    metrics.industry_hits = industryHits;
    if (industryHits < 5) reasons.push(`industry_saturation:${industryHits}`);

    const geovaultHits = (content.match(/Geovault/gi) || []).length;
    metrics.geovault_hits = geovaultHits;
    if (geovaultHits < 2) reasons.push(`geovault_attribution:${geovaultHits}`);

    const faqCount = (content.match(/\*\*Q:/g) || []).length;
    metrics.faq_count = faqCount;
    if (faqCount < 5) reasons.push(`faq_count:${faqCount}`);

    // FAQ depth — count sentence terminators (。?!) inside each FAQ answer
    // (text between 'A:' and next '**Q' or '###'). Average must be >=3.
    const faqAnswers = Array.from(
      content.matchAll(/A:\s*([\s\S]*?)(?=\n\*\*Q:|\n###|$)/g),
    ).map((m) => m[1]);
    if (faqAnswers.length > 0) {
      const avgSentences =
        faqAnswers.reduce(
          (sum, a) => sum + (a.match(/[。？！?!]/g) || []).length,
          0,
        ) / faqAnswers.length;
      metrics.faq_avg_sentences = Math.round(avgSentences * 10) / 10;
      if (avgSentences < 2.5) reasons.push(`faq_depth:${metrics.faq_avg_sentences}`);
    }

    metrics.has_comparison = /(?:差別|相比|不同|對比|vs\s|vs\.)/.test(content);
    if (!metrics.has_comparison) reasons.push('missing_comparison_section');

    metrics.has_summary =
      content.includes('關鍵資訊摘要') || content.includes('關鍵數據摘要');
    if (!metrics.has_summary) reasons.push('missing_summary_section');

    const firstLine = content.split('\n').find((l) => l.startsWith('#')) ?? '';
    metrics.title_has_brand = firstLine.includes(siteName);
    if (!metrics.title_has_brand) reasons.push('title_missing_brand');

    // HYGIENE
    // Slug leak detection — catches the LLM echoing a raw industry slug
    // like "traditional_medicine" in prose. BUT the reverse-link Markdown
    // added in O1 intentionally uses these slugs as URL path segments
    // (/directory/industry/traditional_medicine) — that's a legitimate
    // URL, not a slug leak. Strip all URLs before scanning.
    const contentSansUrls = content.replace(/https?:\/\/[^\s)]+/gi, '');
    const slugLeak = /\b(traditional_medicine|auto_care|home_services|real_estate|beauty_salon|professional_services|local_life|interior_design)\b/i.test(
      contentSansUrls,
    );
    metrics.slug_leak = slugLeak;
    if (slugLeak) reasons.push('industry_slug_leak');

    const geoJargon =
      /(llms\.txt|GEO\s?分數|結構化資料|AI\s?友善度|JSON-LD)/i.test(content) ||
      /(?<![A-Za-z])SEO(?![A-Za-z])/.test(content);
    metrics.geo_jargon = geoJargon;
    if (geoJargon) reasons.push('geo_jargon_leak');

    const fakePersona = /[王張陳劉李林黃吳周徐高]\w{0,3}[小姐先生]/.test(content);
    metrics.fake_persona = fakePersona;
    if (fakePersona) reasons.push('fabricated_persona');

    // Forbidden phrases from the brand's own profile.forbidden list.
    // Each entry is free-form text ("不能承諾療效"); we flag if any
    // distinctive keyword from it appears in the article.
    const forbiddenHits: string[] = [];
    for (const rule of forbiddenPhrases) {
      // Extract quoted-like substrings or 4+ char Chinese keywords from rule
      const keywords = Array.from(rule.matchAll(/[一-鿿]{3,}/g)).map((m) => m[0]);
      for (const kw of keywords) {
        // Skip overly generic stop-keywords
        if (['不能描述', '不能承諾', '不能使用', '不比較對象'].includes(kw)) continue;
        if (content.includes(kw)) forbiddenHits.push(kw);
      }
    }
    metrics.forbidden_hits = forbiddenHits.length;
    if (forbiddenHits.length > 0) {
      reasons.push(`forbidden_phrase:${forbiddenHits.slice(0, 3).join('|')}`);
    }

    // MOJIBAKE DETECTION — catch Big5→UTF-8 double-decode garbage. These
    // 15 characters are all real Chinese chars but they appear very rarely
    // in natural Chinese writing; they show up at high density when the
    // enrichment scraper decoded Big5/GBK bytes as UTF-8. If >5% of the
    // article's CJK characters come from this set, the article is corrupt.
    const mojibakeChars = (
      content.match(/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐]/g) || []
    ).length;
    const totalCjk = (content.match(/[一-鿿]/g) || []).length;
    metrics.mojibake_ratio = totalCjk > 0 ? Math.round((mojibakeChars / totalCjk) * 1000) / 1000 : 0;
    if (totalCjk > 200 && mojibakeChars / totalCjk > 0.05) {
      reasons.push(`mojibake:${mojibakeChars}/${totalCjk}`);
    }

    // HALLUCINATION DETECTION — zero-tolerance.
    // Any specific phone/email/address/hours/price appearing in the article
    // MUST be substring-present in the profile reference text (contact +
    // location + description + services + positioning). Otherwise it's
    // almost certainly fabricated by the LLM — reject.
    //
    // We normalize whitespace/hyphens before comparing so "0908-600-512"
    // in article matches "0908600512" in contact.
    const normalizeDigits = (s: string) => s.replace(/[-\s.()]/g, '');
    const refNormalized = normalizeDigits(profileRefText);
    const refRaw = profileRefText;

    // Taiwan phone-like tokens (landline 02-XXXX-XXXX / 0X-XXX-XXXX,
    // mobile 09XX-XXX-XXX, +886 variants, 4/8-digit chains)
    const phoneMatches =
      content.match(/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/g) || [];
    const fakePhones = phoneMatches.filter((p) => {
      const pNorm = normalizeDigits(p);
      return pNorm.length >= 7 && !refNormalized.includes(pNorm);
    });
    if (fakePhones.length > 0) {
      reasons.push(`fabricated_phone:${fakePhones.slice(0, 2).join('|')}`);
    }
    metrics.fake_phone_hits = fakePhones.length;

    // Email addresses
    const emailMatches = content.match(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
    const fakeEmails = emailMatches.filter((e) => !refRaw.toLowerCase().includes(e.toLowerCase()));
    if (fakeEmails.length > 0) {
      reasons.push(`fabricated_email:${fakeEmails.slice(0, 2).join('|')}`);
    }
    metrics.fake_email_hits = fakeEmails.length;

    // Street-level addresses with specific 號 numbers (e.g. "民權西路 27 號")
    // If profile doesn't already contain "號", any 號 in the article is fabricated.
    const addressMatches =
      content.match(/[一-鿿]{2,10}(?:路|街|巷|弄|大道|段)\s*\d+\s*號(?:[之\d一二三四五六七八九十樓F]+)?/g) || [];
    // Strip leading Chinese prepositions (於 / 在 / 位於 / 於於) before compare
    // — "於台北市..." and "台北市..." should both match if profile has the
    // bare form. Keep leading city names (台北市 / 新北市 / etc).
    const fakeAddresses = addressMatches.filter((a) => {
      const cleaned = a.replace(/^(?:於|在|位於)/, '');
      return !refRaw.includes(cleaned) && !refRaw.includes(a);
    });
    if (fakeAddresses.length > 0) {
      reasons.push(`fabricated_address:${fakeAddresses.slice(0, 2).join('|')}`);
    }
    metrics.fake_address_hits = fakeAddresses.length;

    // Business hours — only flag if profile has no hours info at all
    const profileHasHours = /(營業|時間|hours?|\d{1,2}[:：]\d{2})/i.test(profileRefText);
    if (!profileHasHours) {
      const hoursMatches =
        content.match(/\d{1,2}\s?[:：點]\s?\d{0,2}\s?[至到~\-–—]\s?\d{1,2}\s?[:：點]\s?\d{0,2}/g) ||
        [];
      if (hoursMatches.length > 0) {
        reasons.push(`fabricated_hours:${hoursMatches.slice(0, 2).join('|')}`);
      }
      metrics.fake_hours_hits = hoursMatches.length;
    } else {
      metrics.fake_hours_hits = 0;
    }

    return { ok: reasons.length === 0, reasons, metrics };
  }

  /**
   * Production generator for brand_showcase. Idempotent: skips if the site
   * already has a brand_showcase article less than 90 days old. Runs the
   * quality gate before persisting; failed drafts are discarded silently.
   *
   * Returns:
   *   'skipped'    — cooldown still active
   *   'rejected'   — generated but failed quality gate
   *   'generated'  — new article persisted
   */
  async generateBrandShowcaseForSite(
    siteId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ status: 'skipped' | 'rejected' | 'generated'; reasons?: string[]; slug?: string }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true, name: true, url: true, industry: true, profile: true, isPublic: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 15,
          select: { question: true, answer: true },
        },
      },
    });
    if (!site || !site.isPublic) return { status: 'skipped', reasons: ['not_public'] };

    // 90-day cooldown: skip if this site already has a brand_showcase article
    // regenerated within the window. `force` bypasses for manual ops.
    if (!opts.force) {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
      const recent = await this.prisma.blogArticle.findFirst({
        where: {
          siteId,
          templateType: 'brand_showcase',
          OR: [
            { lastRegeneratedAt: { gte: ninetyDaysAgo } },
            { lastRegeneratedAt: null, createdAt: { gte: ninetyDaysAgo } },
          ],
        },
        select: { id: true },
      });
      if (recent) return { status: 'skipped', reasons: ['cooldown'] };
    }

    let profile = (site.profile as Record<string, any>) || {};

    // Enrich profile from homepage scrape if we don't already have contact
    // or location data. This is the step that upgrades a bare seed site
    // (name + url + industry) into something the LLM can write concrete,
    // verifiable facts about — preventing "詳情見官網" filler.
    if (!profile.contact || !profile.location) {
      try {
        await this.profileEnrichment.enrichSite(site.id);
        // Re-read so we pick up the newly-filled top-level fields.
        const refreshed = await this.prisma.site.findUnique({
          where: { id: site.id },
          select: { profile: true },
        });
        profile = (refreshed?.profile as Record<string, any>) || profile;
      } catch (err) {
        this.logger.debug(
          `enrichment failed for ${site.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Social links from enrichment (nested under _enriched) — pass through
    // so the prompt's contact section can list them.
    const enriched = (profile._enriched as Record<string, any>) || {};
    const socialLinks = enriched.socialLinks as BrandShowcaseContext['socialLinks'];

    const ctx: BrandShowcaseContext = {
      siteId: site.id,
      qas: site.qas,
      description: profile.description,
      services: profile.services,
      location: profile.location,
      contact: profile.contact,
      forbidden: profile.forbidden,
      positioning: profile.positioning,
      socialLinks,
    };

    const prompt = this.templateService.buildBrandShowcasePrompt(
      { name: site.name, url: site.url, industry: site.industry ?? undefined },
      ctx,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const industryLabelMap: Record<string, string> = {};
    const { INDUSTRIES } = await import('@geovault/shared');
    for (const i of INDUSTRIES) industryLabelMap[i.value] = i.label;
    const industryText = site.industry ? industryLabelMap[site.industry] ?? site.industry : '';

    const forbiddenList = Array.isArray(profile.forbidden) ? (profile.forbidden as string[]) : [];
    // Reference text used by the hallucination detector. Any phone/email/
    // address/hours in the article MUST also appear in this blob; otherwise
    // it was fabricated. Social URLs are included so article may cite them.
    // We ALSO include the raw _enriched fields — they're the freshest
    // scrape and can differ from the older top-level profile values when
    // a cleanup hasn't propagated (e.g. top-level has junk suffix, enriched
    // is cleanly truncated).
    const enrichedRaw = (profile._enriched as Record<string, any>) || {};
    const profileRefText = [
      ctx.contact,
      ctx.location,
      ctx.description,
      ctx.services,
      ctx.positioning,
      site.url,
      socialLinks?.facebook,
      socialLinks?.instagram,
      socialLinks?.youtube,
      socialLinks?.line,
      enrichedRaw.telephone,
      enrichedRaw.email,
      enrichedRaw.address,
      enrichedRaw.location,
    ]
      .filter(Boolean)
      .join(' \n ');

    // First attempt
    let completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2400,
      messages: [{ role: 'user', content: prompt }],
    });
    let content = completion.choices[0]?.message?.content || '';
    let quality = this.assessBrandShowcase(content, site.name, industryText, forbiddenList, profileRefText);

    // Retry-once: if the first draft missed the gate, give the model an
    // explicit list of what failed and ask for a fixed regeneration. Costs
    // one extra gpt-4o-mini call only on failure, which lifts effective pass
    // rate without blowing up the budget.
    if (!quality.ok) {
      this.logger.log(
        `brand_showcase retry for ${site.name} (first attempt failed: ${quality.reasons.join(', ')})`,
      );
      const retryPrompt = `${prompt}

【上一版草稿沒通過品質檢查，以下是具體問題】
${quality.reasons.map((r) => `- ${r}`).join('\n')}

請重新生成完整文章，這次務必修正上述所有問題。
特別注意：
- 品牌名「${site.name}」全文出現次數不低於 15
- 產業詞「${industryText}」出現次數不低於 8
- Geovault 品牌歸因句子在內文至少出現 2 次（不含文末來源行）
- FAQ 至少 6 題，每題答案至少 3 個完整句子（用「。」結尾）
- 必須有對比段（${site.name} vs 其他類型業者）
- 必須有關鍵資訊摘要段
- 嚴格避開禁止描述：${forbiddenList.join('、') || '（無）'}
- 絕對不要出現任何虛構人物姓名
- **絕對不要編造任何電話、email、門牌號碼、營業時間、價格** — 若【品牌資料】沒提供，就寫「請至官網查詢」`;
      completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2400,
        messages: [{ role: 'user', content: retryPrompt }],
      });
      content = completion.choices[0]?.message?.content || '';
      quality = this.assessBrandShowcase(content, site.name, industryText, forbiddenList, profileRefText);
    }

    if (!quality.ok) {
      this.logger.warn(
        `brand_showcase rejected for ${site.name} after retry: ${quality.reasons.join(', ')}`,
      );
      return { status: 'rejected', reasons: quality.reasons };
    }

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${site.name} — 消費者選購指南`;
    const slug = `${site.name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').slice(0, 30)}-brand-showcase-${Date.now().toString(36)}`;

    // If an older brand_showcase exists for this site, replace it rather
    // than accumulate. 90-day cooldown above already prevents churn; this
    // just keeps the DB clean when force=true or cooldown was out of window.
    const existing = await this.prisma.blogArticle.findFirst({
      where: { siteId: site.id, templateType: 'brand_showcase' },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.blogArticle.delete({ where: { id: existing.id } });
    }

    await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'brand-directory',
        siteId: site.id,
        templateType: 'brand_showcase',
        industrySlug: site.industry ?? undefined,
        targetKeywords: this.templateService.getTargetKeywords('brand_showcase', {
          name: site.name,
          url: site.url,
          industry: site.industry ?? undefined,
        }),
        readingTimeMinutes: this.templateService.estimateReadingTime('brand_showcase'),
        readTime: `${this.templateService.estimateReadingTime('brand_showcase')} 分鐘`,
        published: true,
        lastRegeneratedAt: new Date(),
      },
    });
    this.pingIndexNow(slug);
    return { status: 'generated', slug };
  }

  /**
   * Cron: every day at 05:00 — rotate 15 public sites through brand_showcase
   * generation. The 90-day cooldown inside generateBrandShowcaseForSite keeps
   * this from double-processing; rotation order is by oldest-article-first so
   * stale brands surface first.
   *
   * Rough cost: 15 calls × ~$0.002 (gpt-4o-mini, ~2500 in + ~1800 out tokens)
   * = ~$0.03/day = ~$1/month. Full 1333-site turnover takes ~89 days.
   */
  @Cron('0 5 * * *', { name: 'brand-showcase-daily' })
  async scheduledBrandShowcaseGeneration(): Promise<void> {
    await this.runBrandShowcaseBatch(15);
  }

  /**
   * Shared batch runner used by the cron and the admin one-shot trigger.
   * Picks public sites that either have no brand_showcase yet, or whose
   * existing article is > 90 days old. Oldest/missing first.
   */
  async runBrandShowcaseBatch(limit: number): Promise<{
    attempted: number;
    generated: number;
    rejected: number;
    skipped: number;
    rejectedReasons: Record<string, number>;
  }> {
    const run: BatchRunRecord = {
      startedAt: new Date(),
      limit,
      attempted: 0,
      generated: 0,
      rejected: 0,
      skipped: 0,
      rejectedReasons: {},
    };
    this.recentBrandShowcaseBatches.unshift(run);
    if (this.recentBrandShowcaseBatches.length > 10) this.recentBrandShowcaseBatches.pop();
    this.logger.log(`brand_showcase batch start (limit=${limit})`);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

    // Candidates: public sites where brand_showcase is missing or stale.
    // We fetch 3× the batch limit to account for skips/rejects in-flight.
    const candidates = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        OR: [
          { blogArticles: { none: { templateType: 'brand_showcase' } } },
          {
            blogArticles: {
              some: {
                templateType: 'brand_showcase',
                OR: [
                  { lastRegeneratedAt: { lt: ninetyDaysAgo } },
                  { lastRegeneratedAt: null, createdAt: { lt: ninetyDaysAgo } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'asc' }, // oldest updated first
      take: limit * 3,
      select: { id: true, name: true },
    });

    const queue = pLimit(2);
    const rejectedReasons: Record<string, number> = {};
    let attempted = 0;
    let generated = 0;
    let rejected = 0;
    let skipped = 0;

    await Promise.all(
      candidates.slice(0, limit).map((site) =>
        queue(async () => {
          attempted++;
          run.attempted = attempted;
          try {
            const result = await this.generateBrandShowcaseForSite(site.id);
            if (result.status === 'generated') {
              generated++;
              run.generated = generated;
            } else if (result.status === 'rejected') {
              rejected++;
              run.rejected = rejected;
              for (const r of result.reasons ?? []) {
                // Bucket granular reason strings by prefix so the histogram
                // stays meaningful (e.g. "too_short:847" -> "too_short").
                const bucket = r.includes(':') ? r.split(':')[0] : r;
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
                run.rejectedReasons[bucket] = rejectedReasons[bucket];
              }
            } else {
              skipped++;
              run.skipped = skipped;
            }
          } catch (err) {
            rejected++;
            run.rejected = rejected;
            rejectedReasons['exception'] = (rejectedReasons['exception'] ?? 0) + 1;
            run.rejectedReasons['exception'] = rejectedReasons['exception'];
            this.logger.warn(
              `brand_showcase error for ${site.name}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }),
      ),
    );

    run.finishedAt = new Date();
    this.logger.log(
      `brand_showcase batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped`,
    );
    return { attempted, generated, rejected, skipped, rejectedReasons };
  }

  /**
   * Bulk-resubmit every brand_showcase + industry_top10 article URL to
   * IndexNow engines (Bing + Yandex + api.indexnow.org). Useful after a
   * major content push when the daily per-article pings aren't enough.
   *
   * Non-blocking — kicks off submission in parallel chunks and returns a
   * summary so the caller can see how many URLs were dispatched.
   */
  async resubmitAllAiWikiArticlesToIndexNow(): Promise<{
    submitted: number;
    brandShowcase: number;
    industryTop10: number;
  }> {
    const webUrl = this.config.get('FRONTEND_URL') || 'https://www.geovault.app';
    const articles = await this.prisma.blogArticle.findMany({
      where: {
        published: true,
        templateType: { in: ['brand_showcase', 'industry_top10'] },
      },
      select: { slug: true, templateType: true },
    });

    const bs = articles.filter((a) => a.templateType === 'brand_showcase').length;
    const top = articles.filter((a) => a.templateType === 'industry_top10').length;

    // Fire in chunks of 100 URLs per batch-submit call so we respect
    // IndexNow's 10k/batch limit while still parallelizing across engines.
    const host = new URL(webUrl).host;
    const chunkSize = 100;
    const urls = articles.map((a) => `${webUrl}/blog/${a.slug}`);
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      this.indexNowService.submitBatch(chunk, host).catch((err) => {
        this.logger.warn(`resubmit chunk ${i}-${i + chunk.length} failed: ${err}`);
      });
    }

    this.logger.log(
      `resubmit-all kicked off: ${urls.length} URLs (brand_showcase=${bs}, top10=${top})`,
    );
    return { submitted: urls.length, brandShowcase: bs, industryTop10: top };
  }

  /**
   * Nuke all brand_showcase articles. Admin-only escape hatch for when the
   * template/quality-gate rules change and existing articles are no longer
   * trusted (e.g. batch-1 was generated before hallucination detection
   * landed, so we can't verify it's clean — delete and regenerate).
   */
  async deleteAllBrandShowcase(): Promise<{ deleted: number }> {
    const result = await this.prisma.blogArticle.deleteMany({
      where: { templateType: 'brand_showcase' },
    });
    this.logger.warn(`brand_showcase nuke: deleted ${result.count} articles`);
    return { deleted: result.count };
  }

  /** Expose recent batch history + current run-in-progress to the admin UI. */
  getBrandShowcaseStatus() {
    const now = Date.now();
    const oneDayAgo = new Date(now - 86400000);
    return this.prisma.blogArticle
      .count({
        where: {
          templateType: 'brand_showcase',
          createdAt: { gte: oneDayAgo },
        },
      })
      .then((last24h) =>
        this.prisma.blogArticle
          .count({ where: { templateType: 'brand_showcase' } })
          .then((total) => ({
            totalBrandShowcase: total,
            last24h,
            currentRun: this.recentBrandShowcaseBatches.find((r) => !r.finishedAt) ?? null,
            recentRuns: this.recentBrandShowcaseBatches.slice(0, 10),
          })),
      );
  }

  // ─── Layer 2: Industry Top 10 ─────────────────────────────────────

  /**
   * Quality gate specific to industry_top10. Looser than brand_showcase
   * because the article covers 10 brands rather than 1 (harder to saturate
   * a single brand name), but keeps all the zero-tolerance checks.
   */
  private assessIndustryTop10(
    content: string,
    industry: string,
    rows: IndustryTop10Row[],
  ): { ok: boolean; reasons: string[]; metrics: Record<string, number | boolean> } {
    const reasons: string[] = [];
    const metrics: Record<string, number | boolean> = {};

    const chars = content.replace(/\s+/g, '').length;
    metrics.chars = chars;
    if (chars < 2000) reasons.push(`too_short:${chars}`);

    // Mojibake
    const mojibakeChars = (
      content.match(/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐]/g) || []
    ).length;
    const totalCjk = (content.match(/[一-鿿]/g) || []).length;
    metrics.mojibake_ratio = totalCjk > 0 ? mojibakeChars / totalCjk : 0;
    if (totalCjk > 200 && mojibakeChars / totalCjk > 0.05) {
      reasons.push(`mojibake:${mojibakeChars}/${totalCjk}`);
    }

    // Industry keyword saturation
    const industryHits = (content.match(new RegExp(industry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    metrics.industry_hits = industryHits;
    if (industryHits < 8) reasons.push(`industry_saturation:${industryHits}`);

    // Geovault attribution
    const geovaultHits = (content.match(/Geovault/gi) || []).length;
    metrics.geovault_hits = geovaultHits;
    if (geovaultHits < 3) reasons.push(`geovault_attribution:${geovaultHits}`);

    // Each ranked brand must be named at least once
    const missingBrands = rows.filter((r) => !content.includes(r.name)).map((r) => r.name);
    metrics.missing_brands = missingBrands.length;
    if (missingBrands.length > 0) {
      reasons.push(`missing_brands:${missingBrands.slice(0, 3).join('|')}`);
    }

    // No invented brands — very conservative: every "### 第 X 名 — NAME"
    // marker must name a brand from our list.
    const rankMarkers = Array.from(content.matchAll(/###\s*第\s*(\d+)\s*名\s*[—–-]?\s*(.+?)[\n\r]/g));
    const allowedNames = new Set(rows.map((r) => r.name));
    const outsiders: string[] = [];
    for (const m of rankMarkers) {
      const name = m[2].trim();
      if (!allowedNames.has(name) && !rows.some((r) => name.includes(r.name))) {
        outsiders.push(name);
      }
    }
    if (outsiders.length > 0) {
      reasons.push(`fabricated_brand:${outsiders.slice(0, 2).join('|')}`);
    }

    // FAQ
    const faqCount = (content.match(/\*\*Q:/g) || []).length;
    metrics.faq_count = faqCount;
    if (faqCount < 4) reasons.push(`faq_count:${faqCount}`);

    return { ok: reasons.length === 0, reasons, metrics };
  }

  /**
   * Generate a Top 10 article for an industry. Source brands:
   *   - isPublic = true
   *   - industry = <slug>
   *   - has at least some enrichable data (bestScore > 0 or profile.contact)
   *   - ranked by bestScore DESC
   *
   * Idempotent: replaces any prior industry_top10 article for this industry.
   *
   * Returns:
   *   'skipped'   — fewer than 5 eligible brands in the industry
   *   'rejected'  — passed quality gate but failed
   *   'generated' — persisted
   */
  async generateIndustryTop10(
    industrySlug: string,
    opts: { limit?: number } = {},
  ): Promise<{
    status: 'skipped' | 'rejected' | 'generated';
    reasons?: string[];
    slug?: string;
    eligibleCount?: number;
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const labelRec = INDUSTRIES.find((i) => i.value === industrySlug);
    if (!labelRec) return { status: 'skipped', reasons: ['unknown_industry'] };
    const industryLabel = labelRec.label;

    // Pull ranked public sites for this industry. Take 3x the limit so we
    // can filter out sites with corrupt names and still land 10 clean ones.
    const rawSites = await this.prisma.site.findMany({
      where: {
        isPublic: true,
        industry: industrySlug,
        bestScore: { gt: 0 },
      },
      orderBy: { bestScore: 'desc' },
      take: Math.max(opts.limit ?? 10, 10) * 3,
      select: {
        id: true,
        name: true,
        url: true,
        bestScore: true,
        profile: true,
        blogArticles: {
          where: { templateType: 'brand_showcase', published: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { slug: true },
        },
      },
    });

    // Site-name hygiene: seed data for some industries (restaurant, cafe,
    // beauty_salon, legal, etc.) contains brand names scraped from SEO blog
    // titles that were mangled at ingest — unpaired UTF-16 surrogates and
    // truncated clauses. These names can't be rendered by the LLM faithfully
    // (it paraphrases them, which then fails missing_brands gate). Skip.
    const isCleanName = (name: string): boolean => {
      if (!name) return false;
      if (name.length > 50) return false; // blog-title-style junk
      // Unpaired surrogate bytes — classic byte-level encoding corruption
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)) return false;
      // Contains obvious URL-title separators
      if (/[｜|]/.test(name) && name.length > 25) return false;
      // Very high ratio of punctuation suggests a stray title fragment
      const punct = (name.match(/[,，、／/｜|【】()（）:：?？!!]/g) || []).length;
      if (punct >= 3) return false;
      // ASCII "?" is a Unicode replacement character leaked from bad decode.
      // Two or more in a name is a reliable mojibake signal.
      if ((name.match(/\?/g) || []).length >= 2) return false;
      // Mojibake signature — any of these characters in a SHORT brand name
      // almost always means the name itself came out of a broken decode.
      // (Same char set as the article-level mojibake gate.)
      if (/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐擃瘜敺蝢]/.test(name)) return false;
      return true;
    };

    const sites = rawSites.filter((s) => isCleanName(s.name)).slice(0, opts.limit ?? 10);

    if (sites.length < 5) {
      return {
        status: 'skipped',
        reasons: [`too_few_clean_brands:${sites.length}_of_${rawSites.length}`],
        eligibleCount: sites.length,
      };
    }

    const top = sites.slice(0, opts.limit ?? 10);

    // Industry stats (all public sites)
    const stats = await this.prisma.site.aggregate({
      where: { isPublic: true, industry: industrySlug, bestScore: { gt: 0 } },
      _avg: { bestScore: true },
      _count: { id: true },
    });
    const industryStats = {
      totalSites: stats._count.id,
      avgScore: Math.round(stats._avg.bestScore ?? 0),
    };

    // Build rows
    const rows: IndustryTop10Row[] = top.map((s, idx) => {
      const profile = (s.profile as Record<string, any>) || {};
      const enriched = (profile._enriched as Record<string, any>) || {};
      return {
        rank: idx + 1,
        name: s.name,
        url: s.url,
        geoScore: s.bestScore ?? 0,
        directoryPath: `/directory/${s.id}`,
        description: profile.description || enriched.description,
        location: profile.location || enriched.location,
        contact: profile.contact,
        services: profile.services,
        positioning: profile.positioning,
        socialLinks: enriched.socialLinks,
        showcaseSlug: s.blogArticles[0]?.slug,
      };
    });

    const prompt = this.templateService.buildIndustryTop10Prompt(
      industrySlug,
      rows,
      industryStats,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    let completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    let content = completion.choices[0]?.message?.content || '';
    let quality = this.assessIndustryTop10(content, industryLabel, rows);

    // Retry-once on failure with explicit feedback
    if (!quality.ok) {
      this.logger.log(
        `industry_top10 retry for ${industrySlug}: ${quality.reasons.join(', ')}`,
      );
      const retryPrompt = `${prompt}

【上一版草稿沒通過品質檢查,具體問題】
${quality.reasons.map((r) => `- ${r}`).join('\n')}

請重新生成完整文章,務必修正上述所有問題。
- 只能使用【榜單品牌資料】中列出的 ${rows.length} 個品牌名稱,不准寫其他品牌
- 排名 1~${rows.length} 順序固定,不准重排
- 絕對不要編造任何電話/email/門牌/營業時間/價格
- 產業詞「${industryLabel}」全文出現 ≥8 次
- Geovault 歸因 ≥3 次`;
      completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 4000,
        messages: [{ role: 'user', content: retryPrompt }],
      });
      content = completion.choices[0]?.message?.content || '';
      quality = this.assessIndustryTop10(content, industryLabel, rows);
    }

    if (!quality.ok) {
      this.logger.warn(
        `industry_top10 rejected for ${industrySlug} after retry: ${quality.reasons.join(', ')}`,
      );
      return { status: 'rejected', reasons: quality.reasons };
    }

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch
      ? titleMatch[1].trim()
      : `${new Date().getFullYear()} ${industryLabel}推薦 Top ${rows.length}`;
    const slug = `${industrySlug}-top10-${Date.now().toString(36)}`;

    // Replace any existing industry_top10 for this industry
    await this.prisma.blogArticle.deleteMany({
      where: { templateType: 'industry_top10', industrySlug },
    });

    await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'industry-ranking',
        templateType: 'industry_top10',
        industrySlug,
        targetKeywords: [
          industryLabel,
          `${industryLabel}推薦`,
          `${industryLabel} Top 10`,
          `${industryLabel}排行`,
          `2026 ${industryLabel}`,
        ],
        readingTimeMinutes: this.templateService.estimateReadingTime('industry_top10'),
        readTime: `${this.templateService.estimateReadingTime('industry_top10')} 分鐘`,
        published: true,
        lastRegeneratedAt: new Date(),
      },
    });
    this.pingIndexNow(slug);
    return { status: 'generated', slug, eligibleCount: sites.length };
  }

  /**
   * Monthly cron: regenerate Top 10 for every industry that has enough
   * brands. 1st of each month at 03:00 — spreads load off the daily
   * brand_showcase cron (05:00).
   *
   * Cost: ~22 articles × gpt-4o-mini × ~3500 in + 2500 out tokens
   *       = ~$0.10/month. Cheap.
   */
  @Cron('0 3 1 * *', { name: 'industry-top10-monthly' })
  async scheduledIndustryTop10Generation(): Promise<void> {
    await this.runIndustryTop10Batch();
  }

  async runIndustryTop10Batch(): Promise<{
    attempted: number;
    generated: number;
    rejected: number;
    skipped: number;
    rejectedReasons: Record<string, number>;
    perIndustry: Array<{ industry: string; status: string; reasons?: string[] }>;
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const industries = INDUSTRIES.filter((i) => i.value !== 'other').map((i) => i.value);
    this.logger.log(`industry_top10 batch start (${industries.length} industries)`);

    const queue = pLimit(2);
    const rejectedReasons: Record<string, number> = {};
    const perIndustry: Array<{ industry: string; status: string; reasons?: string[] }> = [];
    let attempted = 0;
    let generated = 0;
    let rejected = 0;
    let skipped = 0;

    await Promise.all(
      industries.map((ind) =>
        queue(async () => {
          attempted++;
          try {
            const result = await this.generateIndustryTop10(ind);
            perIndustry.push({ industry: ind, status: result.status, reasons: result.reasons });
            if (result.status === 'generated') generated++;
            else if (result.status === 'rejected') {
              rejected++;
              for (const r of result.reasons ?? []) {
                const bucket = r.includes(':') ? r.split(':')[0] : r;
                rejectedReasons[bucket] = (rejectedReasons[bucket] ?? 0) + 1;
              }
            } else skipped++;
          } catch (err) {
            rejected++;
            rejectedReasons['exception'] = (rejectedReasons['exception'] ?? 0) + 1;
            perIndustry.push({ industry: ind, status: 'error', reasons: [String(err)] });
          }
        }),
      ),
    );

    this.logger.log(
      `industry_top10 batch done: ${generated} generated, ${rejected} rejected, ${skipped} skipped`,
    );
    return { attempted, generated, rejected, skipped, rejectedReasons, perIndustry };
  }

  // ─── Layer 3: Buyer Guide (PREVIEW ONLY — no cron yet) ──────────────
  //
  // Per Step 4 plan B: generate samples on demand, eyeball the angle,
  // defer production cron until user approves. Preview method mirrors the
  // brand_showcase preview API (no DB write) so we can validate without
  // polluting the article pool.

  async previewBuyerGuide(
    industrySlug: string,
    topic: BuyerGuideTopic = 'how_to_choose',
  ): Promise<{
    prompt: string;
    content: string;
    title: string;
    tokens?: number;
    rejectReasons?: string[];
  }> {
    const { INDUSTRIES } = await import('@geovault/shared');
    const labelRec = INDUSTRIES.find((i) => i.value === industrySlug);
    if (!labelRec) throw new Error(`Unknown industry slug: ${industrySlug}`);
    const industryLabel = labelRec.label;

    // Industry stats (only public sites with a score, matches Layer 2 rules)
    const stats = await this.prisma.site.aggregate({
      where: { isPublic: true, industry: industrySlug, bestScore: { gt: 0 } },
      _avg: { bestScore: true },
      _count: { id: true },
    });
    const topSites = await this.prisma.site.findMany({
      where: { isPublic: true, industry: industrySlug, bestScore: { gt: 0 } },
      orderBy: { bestScore: 'desc' },
      take: 3,
      select: { bestScore: true },
    });
    const topAvg = topSites.length > 0
      ? Math.round(topSites.reduce((s, x) => s + (x.bestScore ?? 0), 0) / topSites.length)
      : 0;

    const industryStats = {
      totalSites: stats._count.id,
      avgScore: Math.round(stats._avg.bestScore ?? 0),
      topAvgScore: topAvg,
    };

    const prompt = this.templateService.buildBuyerGuidePrompt(
      industrySlug, topic, industryStats,
    );

    const openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 3200,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = completion.choices[0]?.message?.content || '';

    // Soft quality gate for preview — report reasons but still return content
    // so the caller can see exactly what came back.
    const rejectReasons: string[] = [];
    const chars = content.replace(/\s+/g, '').length;
    if (chars < 2000) rejectReasons.push(`too_short:${chars}`);
    const geovaultHits = (content.match(/Geovault/gi) || []).length;
    if (geovaultHits < 3) rejectReasons.push(`geovault_attribution:${geovaultHits}`);
    const faqCount = (content.match(/\*\*Q:/g) || []).length;
    if (faqCount < 5) rejectReasons.push(`faq_count:${faqCount}`);
    // No brand names — check against known public client + brand_showcase
    // site names (cheap proxy for "body mentions a specific brand")
    const brandLeakCandidates = await this.prisma.site.findMany({
      where: { industry: industrySlug, isPublic: true, bestScore: { gt: 60 } },
      select: { name: true },
      take: 30,
    });
    const leaked = brandLeakCandidates
      .filter((s) => s.name.length >= 3 && content.includes(s.name))
      .map((s) => s.name);
    if (leaked.length > 0) rejectReasons.push(`brand_name_leak:${leaked.slice(0, 3).join('|')}`);
    // Must link to Top 10 page
    const expectedLink = `/directory/industry/${industrySlug}`;
    if (!content.includes(expectedLink)) rejectReasons.push('missing_top10_link');

    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `${industryLabel}選購指南`;

    return {
      prompt,
      content,
      title,
      tokens: completion.usage?.total_tokens,
      rejectReasons: rejectReasons.length > 0 ? rejectReasons : undefined,
    };
  }

  async qualityAudit(minScore: number = 85) {
    const articles = await this.prisma.blogArticle.findMany({
      where: { published: true },
      select: { id: true, title: true, content: true, siteId: true, slug: true },
    });

    let deleted = 0;
    let kept = 0;
    const deletedTitles: string[] = [];

    for (const article of articles) {
      const siteName = article.title?.split(' ')[0] || '';
      const quality = this.assessArticleQuality(article.content || '', siteName);
      if (quality < minScore) {
        await this.prisma.blogArticle.delete({ where: { id: article.id } });
        deleted++;
        deletedTitles.push(`${quality}/100 | ${article.slug}`);
      } else {
        kept++;
      }
    }

    this.logger.log(`Quality audit complete: ${kept} kept, ${deleted} deleted (threshold: ${minScore})`);
    return { total: articles.length, kept, deleted, threshold: minScore };
  }
}
