import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmsHostingService } from '../llms-hosting/llms-hosting.service';

const QA_TEMPLATE_TYPE = 'post_publish_long_tail_qa';
const QA_PROMPT_VERSION = 'v1';
const DEFAULT_BATCH_LIMIT = 25;
const PASS_SCORE = 85;

const LONG_TAIL_TEMPLATE_TYPES = [
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_showcase',
  'industry_top10',
  'buyer_guide',
  'industry_current_state',
  'missing_indicator_focus',
  'top_brands_analysis',
  'improvement_opportunity',
  'client_daily',
];

const AUTO_PUBLISH_DRAFT_TEMPLATE_TYPES = [
  'brand_showcase',
  'industry_top10',
  'buyer_guide',
  'industry_current_state',
  'missing_indicator_focus',
  'top_brands_analysis',
  'improvement_opportunity',
];

interface ArticleForQa {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  templateType: string;
  targetKeywords: string[];
  siteId: string | null;
  industrySlug?: string | null;
  createdAt?: Date;
  site: {
    name: string;
    url: string;
    industry: string | null;
    isPublic?: boolean | null;
  } | null;
}

interface ReviewResult {
  passed: boolean;
  totalScore: number;
  ruleScores: Record<string, number>;
  failedRules: string[];
  safeToAutoRepair: boolean;
}

interface RepairPayload {
  title?: string;
  description?: string;
  content?: string;
  targetKeywords?: string[];
}

export interface LongTailQaRunResult {
  checked: number;
  passed: number;
  repaired: number;
  repairFailed: number;
  manualRequired: number;
  skipped: number;
  backlog: number;
  autoPublishedDrafts: number;
  issues: Array<{
    articleId: string;
    slug: string;
    status: 'passed' | 'repaired' | 'repair_failed' | 'manual_required' | 'skipped' | 'auto_published';
    score: number;
    failedRules: string[];
  }>;
}

@Injectable()
export class LongTailArticleQaService {
  private readonly logger = new Logger(LongTailArticleQaService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly llmsHosting: LlmsHostingService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  @Cron('0 10 * * *', { name: 'long-tail-article-qa-repair' })
  async scheduledLongTailQa(): Promise<void> {
    if (this.config.get<string>('CONTENT_QA_CRON_DISABLED') === '1') {
      this.logger.log('Long-tail article QA cron disabled by CONTENT_QA_CRON_DISABLED=1');
      return;
    }

    const limit = this.parseLimit(
      this.config.get<string>('CONTENT_QA_BATCH_LIMIT'),
      DEFAULT_BATCH_LIMIT,
    );
    const result = await this.runQueuedQa({ limit });
    this.logger.log(
      `Long-tail QA checked=${result.checked}, repaired=${result.repaired}, manual=${result.manualRequired}, autoPublished=${result.autoPublishedDrafts}, backlog=${result.backlog}`,
    );
  }

  async runQueuedQa(options: { limit?: number } = {}): Promise<LongTailQaRunResult> {
    const limit = this.parseLimit(String(options.limit ?? ''), DEFAULT_BATCH_LIMIT);
    const articles = await this.findUncheckedArticles(limit);
    const result: LongTailQaRunResult = {
      checked: 0,
      passed: 0,
      repaired: 0,
      repairFailed: 0,
      manualRequired: 0,
      skipped: 0,
      backlog: 0,
      autoPublishedDrafts: 0,
      issues: [],
    };

    for (const article of articles) {
      result.checked++;
      const startedAt = Date.now();
      const initial = this.reviewArticle(article);
      await this.persistQualityLog(article, 'full', 1, initial, Date.now() - startedAt, 'deterministic');

      if (initial.passed) {
        result.passed++;
        result.issues.push(this.issue(article, 'passed', initial));
        continue;
      }

      if (!initial.safeToAutoRepair) {
        result.manualRequired++;
        await this.unpublishFailedArticle(article, initial.failedRules);
        result.issues.push(this.issue(article, 'manual_required', initial));
        continue;
      }

      if (!this.openai) {
        result.skipped++;
        result.issues.push({
          ...this.issue(article, 'skipped', initial),
          failedRules: [...initial.failedRules, 'openai_not_configured'],
        });
        continue;
      }

      const repairStartedAt = Date.now();
      const repaired = await this.repairArticle(article, initial);
      if (!repaired?.content) {
        const failed = {
          ...initial,
          failedRules: [...initial.failedRules, 'repair_empty_response'],
        };
        result.repairFailed++;
        await this.persistQualityLog(article, 'patch', 1, failed, Date.now() - repairStartedAt, this.repairModel());
        await this.unpublishFailedArticle(article, failed.failedRules);
        result.issues.push(this.issue(article, 'repair_failed', failed));
        continue;
      }

      const repairedArticle: ArticleForQa = {
        ...article,
        title: repaired.title?.trim() || article.title,
        description: repaired.description?.trim() || article.description,
        content: repaired.content.trim(),
        targetKeywords: this.normalizeKeywords(repaired.targetKeywords, article.targetKeywords),
      };
      const secondPass = this.reviewArticle(repairedArticle);
      await this.persistQualityLog(article, 'patch', 1, secondPass, Date.now() - repairStartedAt, this.repairModel());

      if (!secondPass.passed) {
        result.repairFailed++;
        await this.unpublishFailedArticle(article, secondPass.failedRules);
        result.issues.push(this.issue(article, 'repair_failed', secondPass));
        continue;
      }

      await this.prisma.blogArticle.update({
        where: { id: article.id },
        data: {
          title: repairedArticle.title,
          description: repairedArticle.description,
          content: repairedArticle.content,
          targetKeywords: repairedArticle.targetKeywords,
          lastRegeneratedAt: new Date(),
        },
      });
      result.repaired++;
      result.issues.push(this.issue(article, 'repaired', secondPass));
    }

    result.backlog = await this.countUncheckedArticles();
    const autoPublish = await this.autoPublishPassedDrafts({ limit });
    result.autoPublishedDrafts = autoPublish.published;
    result.issues.push(...autoPublish.issues);
    await this.notifyAdminsIfNeeded(result);
    return result;
  }

  async autoPublishPassedDrafts(options: { limit?: number } = {}): Promise<{
    checked: number;
    published: number;
    skipped: number;
    issues: LongTailQaRunResult['issues'];
  }> {
    const limit = this.parseLimit(String(options.limit ?? ''), DEFAULT_BATCH_LIMIT);
    const articles = await this.findAutoPublishDraftCandidates(limit);
    const issues: LongTailQaRunResult['issues'] = [];
    let checked = 0;
    let published = 0;
    let skipped = 0;

    for (const article of articles) {
      checked++;
      if (!(await this.isLatestAutoPublishDraft(article))) {
        skipped++;
        continue;
      }

      const startedAt = Date.now();
      const review = this.reviewArticle(article);
      await this.persistQualityLog(article, 'full', 1, review, Date.now() - startedAt, 'deterministic');

      if (!review.passed) {
        skipped++;
        issues.push(this.issue(article, 'manual_required', review));
        continue;
      }

      await this.prisma.blogArticle.update({
        where: { id: article.id },
        data: { published: true, lastRegeneratedAt: new Date() },
      });
      this.llmsHosting.invalidatePlatformLlmsFull(article.siteId ?? undefined);
      published++;
      issues.push(this.issue(article, 'auto_published', review));
      this.logger.log(`Long-tail QA auto-published draft ${article.slug} (${article.templateType})`);
    }

    return { checked, published, skipped, issues };
  }

  private async findUncheckedArticles(take: number): Promise<ArticleForQa[]> {
    return this.prisma.blogArticle.findMany({
      where: {
        published: true,
        templateType: { in: LONG_TAIL_TEMPLATE_TYPES },
        NOT: {
          qualityLogs: {
            some: { templateType: QA_TEMPLATE_TYPE },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        content: true,
        templateType: true,
        targetKeywords: true,
        siteId: true,
        industrySlug: true,
        createdAt: true,
        site: {
          select: {
            name: true,
            url: true,
            industry: true,
            isPublic: true,
          },
        },
      },
    });
  }

  private async findAutoPublishDraftCandidates(take: number): Promise<ArticleForQa[]> {
    return this.prisma.blogArticle.findMany({
      where: {
        published: false,
        templateType: { in: AUTO_PUBLISH_DRAFT_TEMPLATE_TYPES },
        OR: [
          { siteId: null },
          { site: { is: { isPublic: true } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        content: true,
        templateType: true,
        targetKeywords: true,
        siteId: true,
        industrySlug: true,
        createdAt: true,
        site: {
          select: {
            name: true,
            url: true,
            industry: true,
            isPublic: true,
          },
        },
      },
    });
  }

  private async countUncheckedArticles(): Promise<number> {
    return this.prisma.blogArticle.count({
      where: {
        published: true,
        templateType: { in: LONG_TAIL_TEMPLATE_TYPES },
        NOT: {
          qualityLogs: {
            some: { templateType: QA_TEMPLATE_TYPE },
          },
        },
      },
    });
  }

  private async isLatestAutoPublishDraft(article: ArticleForQa): Promise<boolean> {
    const newerWhere = this.replacementScopeWhere(article);
    if (!newerWhere) return false;
    const newerCount = await this.prisma.blogArticle.count({
      where: {
        ...newerWhere,
        createdAt: { gt: article.createdAt ?? new Date(0) },
      },
    });
    return newerCount === 0;
  }

  private replacementScopeWhere(article: ArticleForQa): Record<string, unknown> | null {
    if (article.templateType === 'brand_showcase') {
      if (!article.siteId) return null;
      return { templateType: 'brand_showcase', siteId: article.siteId };
    }

    if (article.templateType === 'industry_top10') {
      if (!article.industrySlug) return null;
      return { templateType: 'industry_top10', industrySlug: article.industrySlug };
    }

    if (article.templateType === 'buyer_guide') {
      if (!article.industrySlug) return null;
      const topic = this.buyerGuideTopicFromSlug(article.slug);
      return {
        templateType: 'buyer_guide',
        industrySlug: article.industrySlug,
        ...(topic ? { slug: { contains: `buyer-guide-${topic}-` } } : {}),
      };
    }

    if (
      article.templateType === 'industry_current_state' ||
      article.templateType === 'missing_indicator_focus' ||
      article.templateType === 'top_brands_analysis' ||
      article.templateType === 'improvement_opportunity'
    ) {
      if (!article.industrySlug) return null;
      return { templateType: article.templateType, industrySlug: article.industrySlug };
    }

    return null;
  }

  private buyerGuideTopicFromSlug(slug: string): string | null {
    const match = slug.match(/buyer-guide-(how_to_choose|red_flags|beginner_primer)-/);
    return match?.[1] ?? null;
  }

  private reviewArticle(article: ArticleForQa): ReviewResult {
    const content = article.content || '';
    const compact = content.replace(/\s+/g, '');
    const failedRules: string[] = [];
    const ruleScores: Record<string, number> = {};

    const add = (key: string, score: number, weight: number, reason?: string) => {
      ruleScores[key] = Math.min(Math.max(0, score), weight);
      if (score < weight && reason) failedRules.push(reason);
    };

    const charCount = compact.length;
    add('length', charCount >= 1200 ? 15 : charCount >= 800 ? 10 : 0, 15, `length:${charCount}`);

    const hasTitle = content.includes(article.title) || /^#{1,2}\s+.+/m.test(content);
    add('title_structure', hasTitle ? 10 : 0, 10, 'title_structure:missing');

    const keywords = article.targetKeywords.filter((k) => k.trim().length >= 2);
    const keywordHits = keywords.filter((k) => content.includes(k)).length;
    const keywordNeed = Math.min(3, Math.max(1, keywords.length));
    add(
      'keyword_coverage',
      keywords.length === 0 || keywordHits >= keywordNeed ? 15 : Math.round((keywordHits / keywordNeed) * 15),
      15,
      `keyword_coverage:${keywordHits}/${keywordNeed}`,
    );

    const faqCount = (content.match(/(^|\n)\s*(Q[:：]|###\s*常見問題|##\s*常見問題)/g) || []).length;
    add('faq_usefulness', faqCount >= 2 || /常見問題/.test(content) ? 10 : 0, 10, `faq_usefulness:${faqCount}`);

    const concreteFacts = [
      /\d+\s*\/\s*100/,
      /\d+\s*(天|週|月|年|分|項|個)/,
      /https?:\/\//,
      article.site?.name ? new RegExp(this.escapeRegex(article.site.name)) : null,
      article.site?.industry ? new RegExp(this.escapeRegex(article.site.industry)) : null,
    ].filter(Boolean) as RegExp[];
    const factHits = concreteFacts.filter((r) => r.test(content)).length;
    add('specific_facts', factHits >= 3 ? 15 : Math.round((factHits / 3) * 15), 15, `specific_facts:${factHits}`);

    const promptLeak = /(網站名稱：|網站 URL：|各項指標狀態：|文章結構要求：|請根據以下)/.test(content);
    add('no_prompt_leak', promptLeak ? 0 : 10, 10, 'prompt_leak');

    const mojibakeHits = (content.match(/[�]|[?][\u4e00-\u9fff]{1,3}[?]/g) || []).length;
    add('no_mojibake', mojibakeHits === 0 ? 10 : 0, 10, `mojibake:${mojibakeHits}`);

    const ctaHits = (content.match(/(立即購買|馬上聯絡|限時優惠|最強|第一名|保證有效)/g) || []).length;
    add('neutral_tone', ctaHits === 0 ? 10 : ctaHits <= 1 ? 5 : 0, 10, `promotional_tone:${ctaHits}`);

    const duplicateHeadings = this.countDuplicateHeadings(content);
    add('no_duplicate_structure', duplicateHeadings === 0 ? 5 : 0, 5, `duplicate_headings:${duplicateHeadings}`);

    const totalScore = Object.values(ruleScores).reduce((sum, s) => sum + s, 0);
    const hardFailures = failedRules.some((r) =>
      r.startsWith('mojibake') ||
      r.startsWith('prompt_leak') ||
      r.startsWith('length:0'),
    );

    return {
      passed: totalScore >= PASS_SCORE && !hardFailures,
      totalScore,
      ruleScores,
      failedRules,
      safeToAutoRepair: !hardFailures || failedRules.some((r) => r.startsWith('prompt_leak')),
    };
  }

  private async repairArticle(article: ArticleForQa, review: ReviewResult): Promise<RepairPayload | null> {
    const prompt = `You are editing an already-published Traditional Chinese GEO article.

Return only valid JSON with this shape:
{"title":"...","description":"...","targetKeywords":["..."],"content":"..."}

Rules:
- Keep factual claims grounded in the provided article and site facts.
- Do not invent phone numbers, addresses, awards, prices, or rankings.
- Keep the article in Traditional Chinese.
- Make it useful for AI citation: concrete facts, clear headings, FAQ, neutral tone.
- Fix these failed rules: ${review.failedRules.join(', ')}

Site facts:
Name: ${article.site?.name ?? 'unknown'}
URL: ${article.site?.url ?? 'unknown'}
Industry: ${article.site?.industry ?? 'unknown'}
Description: ${article.description}

Current metadata:
Title: ${article.title}
Description: ${article.description}
Target keywords: ${article.targetKeywords.join(', ')}
Template type: ${article.templateType}

Current article:
${article.content.slice(0, 9000)}
`;

    const response = await this.openai!.chat.completions.create({
      model: this.repairModel(),
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = response.choices[0]?.message?.content || '';
    return this.parseRepairPayload(raw);
  }

  private parseRepairPayload(raw: string): RepairPayload | null {
    try {
      const jsonText = raw
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const parsed = JSON.parse(jsonText) as RepairPayload;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (err) {
      this.logger.warn(`Failed to parse long-tail QA repair payload: ${err}`);
      return null;
    }
  }

  private normalizeKeywords(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return fallback;
    const cleaned = value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 12);
    return cleaned.length > 0 ? Array.from(new Set(cleaned)) : fallback;
  }

  private async persistQualityLog(
    article: ArticleForQa,
    stage: 'full' | 'patch',
    attempt: number,
    review: ReviewResult,
    durationMs: number,
    model: string,
  ): Promise<void> {
    await this.prisma.articleQualityLog.create({
      data: {
        templateType: QA_TEMPLATE_TYPE,
        promptVersion: QA_PROMPT_VERSION,
        stage,
        attempt,
        passed: review.passed,
        totalScore: review.totalScore,
        ruleScores: review.ruleScores,
        failedRules: review.failedRules,
        model,
        charCount: article.content.length,
        durationMs,
        siteId: article.siteId,
        articleId: article.id,
      },
    });
  }

  private async notifyAdminsIfNeeded(result: LongTailQaRunResult): Promise<void> {
    if (result.repaired === 0 && result.manualRequired === 0 && result.repairFailed === 0) return;

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
      take: 20,
    });
    if (admins.length === 0) return;

    const title = 'Long-tail article QA completed';
    const message = [
      `Checked: ${result.checked}`,
      `Repaired: ${result.repaired}`,
      `Repair failed: ${result.repairFailed}`,
      `Manual required: ${result.manualRequired}`,
      `Auto-published drafts: ${result.autoPublishedDrafts}`,
      `Backlog: ${result.backlog}`,
    ].join('\n');

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'content_quality',
        title,
        message,
      })),
    });
  }

  private async unpublishFailedArticle(article: ArticleForQa, failedRules: string[]): Promise<void> {
    await this.prisma.blogArticle.update({
      where: { id: article.id },
      data: { published: false, lastRegeneratedAt: new Date() },
    });
    this.llmsHosting.invalidatePlatformLlmsFull(article.siteId ?? undefined);
    this.logger.warn(
      `Long-tail QA unpublished ${article.slug}: ${failedRules.join(', ') || 'quality_failed'}`,
    );
  }

  private issue(
    article: ArticleForQa,
    status: LongTailQaRunResult['issues'][number]['status'],
    review: ReviewResult,
  ): LongTailQaRunResult['issues'][number] {
    return {
      articleId: article.id,
      slug: article.slug,
      status,
      score: review.totalScore,
      failedRules: review.failedRules,
    };
  }

  private countDuplicateHeadings(content: string): number {
    const headings = Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm)).map((m) => m[1].trim());
    return headings.length - new Set(headings).size;
  }

  private repairModel(): string {
    return this.config.get<string>('CONTENT_QA_REPAIR_MODEL') || 'gpt-4o-mini';
  }

  private parseLimit(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, 100);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
