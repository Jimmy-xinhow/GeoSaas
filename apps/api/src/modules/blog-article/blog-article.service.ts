import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogTemplateService, TemplateType } from './blog-template.service';
import { IndexNowService } from '../indexnow/indexnow.service';
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

@Injectable()
export class BlogArticleService {
  private readonly logger = new Logger(BlogArticleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly templateService: BlogTemplateService,
    private readonly indexNowService: IndexNowService,
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
