import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowService } from '../indexnow/indexnow.service';
import { emitLlmsFullInvalidated, REDIS_KEY_LLMS_FULL, REDIS_KEY_LLMS_SUMMARY } from '../llms-hosting/llms-full-cache';
import { assertSiteAccess } from '../../common/auth/site-access';
import { CreateQaDto } from './dto/create-qa.dto';
import { UpdateQaDto } from './dto/update-qa.dto';
import { buildKnowledgeXlsx } from './knowledge-xlsx.util';
import { extractKnowledgeText, KnowledgeImportUpload } from './knowledge-import-parser';

const MAX_QA_PER_SITE = 200;
const WEB_URL = process.env.FRONTEND_URL ?? 'https://www.geovault.app';
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_TEXT_CHARS = 60000;
const MAX_IMPORT_ITEMS = 50;
const KNOWLEDGE_IMPORT_DEDUPE_DAYS = 30;
const KNOWLEDGE_IMPORT_LIMITS = {
  FREE: 3,
  STARTER: 10,
  PRO: 30,
} as const;
const IMPORT_CATEGORIES = new Set(['brand', 'industry', 'product', 'consumer', 'education']);

export interface GeneratedQa {
  question: string;
  answer: string;
  category: string;
}

export interface KnowledgeImportDraftItem extends GeneratedQa {
  confidence?: number;
  sourceExcerpt?: string;
}

export interface KnowledgeImportQuota {
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date | null;
}

interface BatchConfig {
  category: string;
  label: string;
  count: number;
  focusPrompt: string;
}

@Injectable()
export class KnowledgeService implements OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeService.name);
  private openai: OpenAI | null = null;
  private readonly redis: Redis | null;
  private redisAvailable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planUsage: PlanUsageService,
    private readonly indexNow: IndexNowService,
  ) {
    this.initOpenAIClient();
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis llms-full cache invalidation unavailable: ${err.message}`);
        this.redisAvailable = false;
        this.redis?.disconnect();
      });
    } catch (err) {
      this.logger.warn(`Redis init failed for knowledge invalidation: ${err}`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => {});
  }

  /**
   * When a site's knowledge base gains new Q&As, its directory page +
   * llms-full.txt both render different content — ping IndexNow so Bing
   * and Yandex re-crawl within ~24h. Fire-and-forget; don't block the
   * user-facing response.
   */
  private pingKnowledgeUpdate(siteId: string): void {
    const urls = [
      `${WEB_URL}/directory/${siteId}`,
      `${WEB_URL}/llms-full.txt`,
    ];
    for (const url of urls) {
      this.indexNow
        .submitUrl(url)
        .catch((err) => this.logger.warn(`IndexNow ping failed for ${url}: ${err}`));
    }
    emitLlmsFullInvalidated();
    if (!this.redis || !this.redisAvailable) return;
    this.redis.del(REDIS_KEY_LLMS_FULL, REDIS_KEY_LLMS_SUMMARY).catch((err) => {
      this.logger.warn(`Redis llms-full cache delete failed: ${err}`);
    });
  }

  private initOpenAIClient() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.openai = null;
    }
  }

  async verifySiteOwnership(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  private async checkLimit(siteId: string, addCount: number = 1) {
    const current = await this.prisma.siteQa.count({ where: { siteId } });
    if (current + addCount > MAX_QA_PER_SITE) {
      throw new BadRequestException(
        `知識庫上限為 ${MAX_QA_PER_SITE} 筆，目前已有 ${current} 筆，無法再新增 ${addCount} 筆`,
      );
    }
  }

  async findAll(siteId: string, userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    return this.prisma.siteQa.findMany({
      where: { siteId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async exportXlsx(siteId: string, userId: string, role?: string) {
    const site = await this.verifySiteOwnership(siteId, userId, role);
    const qas = await this.prisma.siteQa.findMany({
      where: { siteId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      fileName: `${this.safeFileName(site.name || 'knowledge')}-knowledge-${new Date().toISOString().slice(0, 10)}.xlsx`,
      buffer: buildKnowledgeXlsx(
        {
          id: site.id,
          name: site.name,
          url: site.url,
        },
        qas,
      ),
    };
  }

  private safeFileName(value: string): string {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'knowledge';
  }

  async create(siteId: string, dto: CreateQaDto, userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    await this.checkLimit(siteId);

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.siteQa.create({
      data: {
        siteId,
        question: dto.question,
        answer: dto.answer,
        category: dto.category || null,
        sortOrder: nextSort,
      },
    });
    this.pingKnowledgeUpdate(siteId);
    return created;
  }

  async batchCreate(siteId: string, items: CreateQaDto[], userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    await this.checkLimit(siteId, items.length);

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const data = items.map((item) => ({
      siteId,
      question: item.question,
      answer: item.answer,
      category: item.category || null,
      sortOrder: nextSort++,
    }));

    await this.prisma.siteQa.createMany({ data });
    this.pingKnowledgeUpdate(siteId);
    return this.findAll(siteId, userId, role);
  }

  /** Admin bulk import - bypasses ownership check */
  async adminBatchCreate(siteId: string, items: CreateQaDto[]) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const data = items.map((item) => ({
      siteId,
      question: item.question,
      answer: item.answer,
      category: item.category || null,
      sortOrder: nextSort++,
    }));

    const result = await this.prisma.siteQa.createMany({ data, skipDuplicates: true });
    if (result.count > 0) this.pingKnowledgeUpdate(siteId);
    return { imported: result.count, total: nextSort };
  }

  async update(qaId: string, siteId: string, dto: UpdateQaDto, userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    const qa = await this.prisma.siteQa.findFirst({
      where: { id: qaId, siteId },
    });
    if (!qa) throw new NotFoundException('Q&A not found');
    const updated = await this.prisma.siteQa.update({ where: { id: qaId }, data: dto });
    this.pingKnowledgeUpdate(siteId);
    return updated;
  }

  async remove(qaId: string, siteId: string, userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    const qa = await this.prisma.siteQa.findFirst({
      where: { id: qaId, siteId },
    });
    if (!qa) throw new NotFoundException('Q&A not found');
    const deleted = await this.prisma.siteQa.delete({ where: { id: qaId } });
    this.pingKnowledgeUpdate(siteId);
    return deleted;
  }

  private isPrivilegedRole(role?: string | null): boolean {
    return role === 'STAFF' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  private getMonthWindow(): { monthStart: Date; nextMonthStart: Date } {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { monthStart, nextMonthStart };
  }

  private normalizeQuestion(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeCategory(category?: string | null): string {
    const normalized = (category || '').trim().toLowerCase();
    return IMPORT_CATEGORIES.has(normalized) ? normalized : 'product';
  }

  private parseImportJson(raw: string): any {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const objectStart = cleaned.indexOf('{');
      const objectEnd = cleaned.lastIndexOf('}');
      if (objectStart >= 0 && objectEnd > objectStart) {
        try {
          return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
        } catch {
          // Fall through to array extraction.
        }
      }

      const arrayStart = cleaned.indexOf('[');
      const arrayEnd = cleaned.lastIndexOf(']');
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        try {
          return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
        } catch {
          // Fall through to a user-facing 400 response.
        }
      }

      throw new BadRequestException('AI 無法解析匯入內容，請換成較清楚的檔案後再試。');
    }
  }

  private sanitizeImportDraftItems(
    parsed: any,
    existingQuestions: Set<string>,
  ): KnowledgeImportDraftItem[] {
    const rawItems = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(rawItems)) return [];

    const seen = new Set<string>();
    const items: KnowledgeImportDraftItem[] = [];
    for (const raw of rawItems) {
      const question = String(raw?.question ?? '').trim();
      const answer = String(raw?.answer ?? '').trim();
      if (question.length < 2 || answer.length < 2) continue;

      const normalized = this.normalizeQuestion(question);
      if (!normalized || seen.has(normalized) || existingQuestions.has(normalized)) continue;
      seen.add(normalized);

      const confidence = Number(raw?.confidence);
      const sourceExcerpt = String(raw?.sourceExcerpt ?? '').trim();
      items.push({
        question: question.slice(0, 500),
        answer: answer.slice(0, 5000),
        category: this.normalizeCategory(raw?.category),
        confidence: Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : undefined,
        sourceExcerpt: sourceExcerpt ? sourceExcerpt.slice(0, 200) : undefined,
      });

      if (items.length >= MAX_IMPORT_ITEMS) break;
    }

    return items;
  }

  private readImportDraftJson(value: unknown): { items: KnowledgeImportDraftItem[]; warnings: string[] } {
    const draft = value as any;
    return {
      items: Array.isArray(draft?.items) ? draft.items : [],
      warnings: Array.isArray(draft?.warnings)
        ? draft.warnings.filter((item: unknown) => typeof item === 'string')
        : [],
    };
  }

  private async assertImportQuota(userId: string, role?: string): Promise<void> {
    const quota = await this.getImportQuota(userId, role);
    if (quota.limit !== -1 && quota.remaining <= 0) {
      throw new ForbiddenException(
        `本月 AI 檔案匯入免費額度已用完（${quota.used}/${quota.limit}）。下個月會自動重置。`,
      );
    }
  }

  async getImportQuota(userId: string, role?: string): Promise<KnowledgeImportQuota> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });
    const userRole = role || user?.role || 'USER';
    if (this.isPrivilegedRole(userRole)) {
      return { used: 0, limit: -1, remaining: -1, resetAt: null };
    }

    const effectivePlan = await this.planUsage.getEffectivePlan(userId, user?.plan || 'FREE');
    const limit =
      KNOWLEDGE_IMPORT_LIMITS[effectivePlan as keyof typeof KNOWLEDGE_IMPORT_LIMITS] ??
      KNOWLEDGE_IMPORT_LIMITS.FREE;
    const { monthStart, nextMonthStart } = this.getMonthWindow();
    const used = await this.prisma.knowledgeImportJob.count({
      where: {
        userId,
        countsTowardQuota: true,
        status: { in: ['previewed', 'imported'] },
        createdAt: { gte: monthStart },
      },
    });

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetAt: nextMonthStart,
    };
  }

  async getImportQuotaForSite(siteId: string, userId: string, role?: string) {
    await this.verifySiteOwnership(siteId, userId, role);
    return this.getImportQuota(userId, role);
  }

  async previewImport(
    siteId: string,
    file: KnowledgeImportUpload | undefined,
    userId: string,
    role?: string,
  ) {
    const site = await this.verifySiteOwnership(siteId, userId, role);
    if (!file?.buffer?.length) {
      throw new BadRequestException('請先選擇要匯入的檔案。');
    }
    if (file.size > MAX_IMPORT_FILE_BYTES || file.buffer.length > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('檔案過大，單次匯入上限為 10MB。');
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const dedupeAfter = new Date();
    dedupeAfter.setDate(dedupeAfter.getDate() - KNOWLEDGE_IMPORT_DEDUPE_DAYS);
    const cachedJob = await this.prisma.knowledgeImportJob.findFirst({
      where: {
        siteId,
        userId,
        fileHash,
        status: { in: ['previewed', 'imported'] },
        createdAt: { gte: dedupeAfter },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (cachedJob?.draftJson) {
      const draft = this.readImportDraftJson(cachedJob.draftJson);
      return {
        jobId: cachedJob.id,
        reused: true,
        quota: await this.getImportQuota(userId, role),
        file: {
          name: cachedJob.fileName,
          size: cachedJob.byteSize,
          mimeType: cachedJob.mimeType,
          extractedChars: cachedJob.extractedChars,
        },
        items: draft.items,
        warnings: draft.warnings,
      };
    }

    await this.assertImportQuota(userId, role);
    if (!this.openai) {
      throw new BadRequestException('AI 匯入尚未設定 OPENAI_API_KEY。');
    }

    let extracted;
    try {
      extracted = extractKnowledgeText(file);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '檔案解析失敗。');
    }

    const sourceText = extracted.text.trim();
    if (!sourceText) {
      throw new BadRequestException('檔案內沒有可讀文字，請換成 TXT、MD、CSV、JSON、DOCX 或 XLSX。');
    }
    const truncatedText =
      sourceText.length > MAX_IMPORT_TEXT_CHARS
        ? `${sourceText.slice(0, MAX_IMPORT_TEXT_CHARS)}\n\n[TRUNCATED]`
        : sourceText;

    const existing = await this.prisma.siteQa.findMany({
      where: { siteId },
      select: { question: true },
    });
    const existingQuestions = new Set(existing.map((item) => this.normalizeQuestion(item.question)));
    const profile = (site as any).profile ?? {};
    const model = this.config.get<string>('KNOWLEDGE_IMPORT_AI_MODEL') || 'gpt-4o-mini';

    const response = await this.openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract public brand/product knowledge into concise Traditional Chinese Q&A. Only use facts present in the uploaded text. Return strict JSON.',
        },
        {
          role: 'user',
          content: `請把以下客戶提供的檔案內容整理成可匯入知識庫的 Q&A 草稿。

限制：
- 只使用檔案內明確出現的資訊，不要編造。
- 使用繁體中文。
- 最多 ${MAX_IMPORT_ITEMS} 筆。
- 分類只能使用 brand, industry, product, consumer, education。
- 避免和既有問題重複。
- 回傳 JSON object，格式如下：
{
  "items": [
    {
      "question": "問題",
      "answer": "回答",
      "category": "product",
      "confidence": 0.8,
      "sourceExcerpt": "檔案中的依據片段"
    }
  ],
  "warnings": ["無法判斷的地方"]
}

網站：
${JSON.stringify(
  {
    name: site.name,
    url: site.url,
    industry: site.industry,
    profile,
  },
  null,
  2,
)}

既有問題：
${existing.map((item) => `- ${item.question}`).join('\n') || '(none)'}

檔案內容（${extracted.sourceType}）：
${truncatedText}`,
        },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '{"items":[]}';
    const parsed = this.parseImportJson(rawText);
    const items = this.sanitizeImportDraftItems(parsed, existingQuestions);
    const aiWarnings = Array.isArray(parsed?.warnings)
      ? parsed.warnings.filter((item: unknown) => typeof item === 'string')
      : [];
    const warnings = [
      ...extracted.warnings,
      ...(sourceText.length > MAX_IMPORT_TEXT_CHARS
        ? [`Only the first ${MAX_IMPORT_TEXT_CHARS} characters were analyzed.`]
        : []),
      ...aiWarnings,
    ];

    if (items.length === 0) {
      throw new BadRequestException('AI 沒有從檔案中整理出可匯入的 Q&A，請確認檔案內容是否包含商品或品牌資訊。');
    }

    const job = await this.prisma.knowledgeImportJob.create({
      data: {
        userId,
        siteId,
        fileName: file.originalname || 'knowledge-import',
        fileHash,
        mimeType: file.mimetype || null,
        byteSize: file.size || file.buffer.length,
        extractedChars: Math.min(sourceText.length, MAX_IMPORT_TEXT_CHARS),
        generatedCount: items.length,
        countsTowardQuota: true,
        status: 'previewed',
        draftJson: { items, warnings } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      jobId: job.id,
      reused: false,
      quota: await this.getImportQuota(userId, role),
      file: {
        name: job.fileName,
        size: job.byteSize,
        mimeType: job.mimeType,
        extractedChars: job.extractedChars,
      },
      items,
      warnings,
    };
  }

  async commitImport(
    siteId: string,
    jobId: string,
    items: Array<{ question: string; answer: string; category?: string }>,
    userId: string,
    role?: string,
  ) {
    await this.verifySiteOwnership(siteId, userId, role);
    const job = await this.prisma.knowledgeImportJob.findFirst({
      where: {
        id: jobId,
        siteId,
        ...(this.isPrivilegedRole(role) ? {} : { userId }),
      },
    });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === 'failed') throw new BadRequestException('這次匯入已失敗，請重新上傳檔案。');

    const existing = await this.prisma.siteQa.findMany({
      where: { siteId },
      select: { question: true },
    });
    const existingQuestions = new Set(existing.map((item) => this.normalizeQuestion(item.question)));
    const seen = new Set<string>();
    const accepted = items
      .map((item) => ({
        question: String(item.question || '').trim().slice(0, 500),
        answer: String(item.answer || '').trim().slice(0, 5000),
        category: this.normalizeCategory(item.category),
      }))
      .filter((item) => {
        if (item.question.length < 2 || item.answer.length < 2) return false;
        const normalized = this.normalizeQuestion(item.question);
        if (seen.has(normalized) || existingQuestions.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, MAX_IMPORT_ITEMS);

    if (accepted.length === 0) {
      throw new BadRequestException('沒有可匯入的新 Q&A，可能都已存在於知識庫。');
    }
    await this.checkLimit(siteId, accepted.length);

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    const data = accepted.map((item) => ({
      siteId,
      question: item.question,
      answer: item.answer,
      category: item.category,
      sortOrder: nextSort++,
    }));

    const result = await this.prisma.siteQa.createMany({ data });
    await this.prisma.knowledgeImportJob.update({
      where: { id: job.id },
      data: {
        status: 'imported',
        importedCount: result.count,
      },
    });

    if (result.count > 0) this.pingKnowledgeUpdate(siteId);
    return {
      imported: result.count,
      items: await this.findAll(siteId, userId, role),
    };
  }

  private filterLowQuality(items: GeneratedQa[]): GeneratedQa[] {
    const placeholderPattern = /\[.*?\]|XXX|OOO|（請填入）|{.*?}/;
    return items.filter((item) => {
      if (item.question.length < 5) return false;
      if (item.answer.length < 50) return false;
      if (placeholderPattern.test(item.question) || placeholderPattern.test(item.answer)) return false;
      return true;
    });
  }

  // ── AI auto-generation: 5 parallel batches (returns preview, NOT saved to DB) ──
  async aiGenerate(siteId: string, userId: string, excludeQuestions?: string[], role?: string): Promise<GeneratedQa[]> {
    const site = await this.verifySiteOwnership(siteId, userId, role);

    // Check plan limit: knowledgePerMonth
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const check = await this.planUsage.checkAndIncrement(userId, 'knowledgePerMonth', user.plan, user.role);
      if (!check.allowed) {
        throw new ForbiddenException(
          `已達本月知識庫生成額度上限（${check.used}/${check.limit}）。請升級方案以繼續使用。`,
        );
      }
    }

    if (!this.openai) {
      throw new BadRequestException('AI 功能未啟用（OPENAI_API_KEY 未設定）');
    }

    // Crawl website for context
    let html = '';
    try {
      const response = await fetch(site.url, {
        headers: {
          'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://www.geovault.app/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch (err) {
      this.logger.warn(`Failed to crawl ${site.url}: ${err}`);
    }

    // Fetch existing Q&As so AI avoids duplication
    const existing = await this.prisma.siteQa.findMany({
      where: { siteId },
      select: { question: true },
    });
    const existingQuestions = [
      ...existing.map((q: any) => q.question),
      ...(excludeQuestions || []),
    ];

    const truncatedHtml =
      html.length > 6000
        ? html.substring(0, 6000) + '\n... (截斷)'
        : html || '(無法取得網頁內容)';

    // Get site profile for business context
    const profile = (site as any).profile as Record<string, any> | null;

    // Build profile context block
    let profileBlock = '';
    if (profile && Object.keys(profile).length > 0) {
      const lines: string[] = [];
      if (profile.industry) lines.push(`行業: ${profile.industry}`);
      if (profile.description) lines.push(`業務描述: ${profile.description}`);
      if (profile.services) lines.push(`主要服務/產品: ${profile.services}`);
      if (profile.targetAudience) lines.push(`目標客群: ${profile.targetAudience}`);
      if (profile.location) lines.push(`營業地區: ${profile.location}`);
      if (profile.keywords?.length) lines.push(`核心關鍵字: ${profile.keywords.join('、')}`);
      if (profile.uniqueValue) lines.push(`獨特價值/賣點: ${profile.uniqueValue}`);
      if (profile.contactInfo) lines.push(`聯絡資訊: ${profile.contactInfo}`);
      profileBlock = `\n業主基本資訊:\n${lines.join('\n')}`;
    }

    // Define 5 batch focus areas
    const batches: BatchConfig[] = [
      {
        category: 'brand',
        label: '品牌核心',
        count: 12,
        focusPrompt: `聚焦方向：品牌與企業核心
生成關於以下面向的問答：
- 企業/品牌介紹（是什麼、做什麼）
- 核心服務和產品特色
- 品牌故事與理念
- 使用方式和流程
- 營業時間/地點/聯絡方式
- 與競爭對手的差異化優勢`,
      },
      {
        category: 'industry',
        label: '行業知識',
        count: 12,
        focusPrompt: `聚焦方向：所屬行業通識與趨勢
生成關於以下面向的問答（不要只圍繞品牌本身，要擴展到整個行業領域）：
- 行業基礎知識和專業術語解釋
- 行業最新趨勢和發展方向
- 行業標準和規範
- 常見的行業迷思和正確觀念
- 行業的歷史演變
- 該領域的重要概念和原理`,
      },
      {
        category: 'product',
        label: '產品服務',
        count: 12,
        focusPrompt: `聚焦方向：產品/服務的專業深度
生成關於以下面向的問答：
- 產品/服務的技術細節和規格
- 使用教學和最佳實踐
- 保養維護和注意事項
- 產品比較和選擇指南
- 適用場景和案例分享
- 客製化選項和特殊需求`,
      },
      {
        category: 'consumer',
        label: '消費者疑慮',
        count: 12,
        focusPrompt: `聚焦方向：消費者常見疑慮與決策
生成關於以下面向的問答：
- 價格相關問題（費用結構、性價比、優惠）
- 售後服務（保固、退換、維修）
- 付款方式和交易安全
- 購買前的疑慮和擔心
- 與其他選項的比較和優劣
- 實際用戶的體驗和效果`,
      },
      {
        category: 'education',
        label: '教育延伸',
        count: 12,
        focusPrompt: `聚焦方向：教育性與延伸知識科普
生成關於以下面向的問答（用科普的角度，讓讀者學到東西）：
- 「如何選擇」系列指南
- 「注意事項」和「避坑指南」
- 相關領域的科普知識
- DIY 技巧和實用建議
- 環保/永續/健康等延伸話題
- 入門者的引導和常見疑問`,
      },
    ];

    // Run 5 AI calls in parallel
    const batchPromises = batches.map((batch) =>
      this.generateBatch(batch, site, profile, truncatedHtml, profileBlock, existingQuestions),
    );

    const results = await Promise.allSettled(batchPromises);

    // Collect all successful results
    const allGenerated: GeneratedQa[] = [];
    const errors: string[] = [];
    for (const [i, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        allGenerated.push(...result.value);
        this.logger.log(`Batch "${batches[i].label}" generated ${result.value.length} Q&As`);
      } else {
        const errMsg = String(result.reason);
        this.logger.error(`Batch "${batches[i].label}" failed: ${errMsg}`);
        errors.push(errMsg);
      }
    }

    this.logger.log(`Total AI-generated Q&As (before filter): ${allGenerated.length}`);

    // If all batches failed, throw an error with a clear message
    if (allGenerated.length === 0 && errors.length > 0) {
      const firstError = errors[0];
      this.logger.error(`All AI batches failed. First error: ${firstError}`);

      // Credit / billing errors
      const isBilling = errors.some(
        (e) =>
          e.includes('credit balance is too low') ||
          e.includes('billing') ||
          e.includes('insufficient') ||
          e.includes('exceeded your current quota') ||
          e.includes('payment') ||
          (e.includes('402') && e.includes('error')),
      );
      if (isBilling) {
        throw new BadRequestException(
          `AI API 餘額不足或帳單問題，請確認 OpenAI 帳戶餘額。原始錯誤: ${firstError.substring(0, 200)}`,
        );
      }

      // Authentication errors
      const isAuth = errors.some(
        (e) =>
          e.includes('authentication') ||
          e.includes('invalid api key') ||
          e.includes('invalid x-api-key') ||
          e.includes('unauthorized') ||
          e.includes('401') ||
          e.includes('AuthenticationError') ||
          e.includes('permission'),
      );
      if (isAuth) {
        throw new BadRequestException(
          `AI API 金鑰無效或已過期，請確認 OPENAI_API_KEY 是否正確，並重啟伺服器。原始錯誤: ${firstError.substring(0, 200)}`,
        );
      }

      // Rate limit errors
      const isRateLimit = errors.some(
        (e) =>
          e.includes('rate_limit') ||
          e.includes('rate limit') ||
          e.includes('429') ||
          e.includes('too many requests') ||
          e.includes('overloaded'),
      );
      if (isRateLimit) {
        throw new BadRequestException(
          'AI API 請求過於頻繁，請稍等 1-2 分鐘後再試',
        );
      }

      throw new BadRequestException(
        `AI 生成失敗: ${firstError.substring(0, 200)}`,
      );
    }

    const filtered = this.filterLowQuality(allGenerated);
    this.logger.log(`After quality filter: ${filtered.length}/${allGenerated.length}`);
    return filtered;
  }

  private async generateBatch(
    batch: BatchConfig,
    site: { name: string; url: string },
    profile: Record<string, any> | null,
    truncatedHtml: string,
    profileBlock: string,
    existingQuestions: string[],
  ): Promise<GeneratedQa[]> {
    const prompt = `分析以下網站和業務資訊，生成 ${batch.count} 個高品質的常見問答。

網站名稱: ${site.name}
網站網址: ${site.url}
${profileBlock}

網站 HTML 內容（部分）:
${truncatedHtml}

${existingQuestions.length > 0 ? `已有的問題（請勿重複）:\n${existingQuestions.map((q) => `- ${q}`).join('\n')}\n` : ''}
${batch.focusPrompt}

要求：
1. 問題要貼近真實用戶會在 Google、ChatGPT、Perplexity 等搜尋或詢問的內容
2. 答案要具體、有價值、資訊豐富，結合網站實際資訊${profile ? '和業主提供的基本資料' : ''}
3. 每個答案 100-350 字，確保足夠詳細能被 AI 引用
4. 使用繁體中文
5. 答案風格專業但易懂，適合被 AI 搜尋引擎引用作為權威來源
6. 問題要多元化，覆蓋面要廣，不要侷限在品牌本身
7. 絕對不要跟已有的問題重複

只輸出 JSON 陣列: [{"question": "...", "answer": "..."}, ...]`;

    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        {
          role: 'system',
          content:
            `你是 GEO（Generative Engine Optimization）內容策略師，專精於「${batch.label}」面向的知識庫建構。` +
            '你的目標是生成能被 AI 搜尋引擎（ChatGPT、Claude、Perplexity、Gemini、Copilot）引用的高品質 Q&A。' +
            '只輸出有效的 JSON 陣列，不要其他文字。',
        },
        { role: 'user', content: prompt },
      ],
    });

    let text = response.choices[0]?.message?.content?.trim() || '[]';
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    try {
      const parsed: { question: string; answer: string }[] = JSON.parse(text);
      return parsed.map((item) => ({
        question: item.question,
        answer: item.answer,
        category: batch.category,
      }));
    } catch {
      this.logger.error(`Failed to parse AI response for batch "${batch.label}"`);
      return [];
    }
  }
}
