import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSiteCmsArticleDto,
  SiteCmsArticlePreviewDto,
  SiteCmsArticleQueryDto,
  SiteCmsChangePasswordDto,
  SiteCmsLoginDto,
  SiteCmsFaqDto,
  SiteCmsSourceDto,
  UpdateSiteCmsArticleDto,
} from './dto';
import { SiteCmsContentFormat, SiteCmsContentService } from './site-cms-content.service';
import { evaluateSiteCmsArticle } from './site-cms-quality';
import { SiteCmsContext } from './site-cms.types';

const DUMMY_PASSWORD_HASH = '$2b$12$gSSUv9GLzBbwuWibEA/zSeiq9HimhpdO/RR4qM95po7LThcH2LPGa';
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = 8;

@Injectable()
export class SiteCmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: SiteCmsContentService,
  ) {}

  async login(siteId: string, dto: SiteCmsLoginDto) {
    const account = await this.prisma.siteCmsAccount.findUnique({
      where: { siteId_username: { siteId, username: dto.username } },
      include: { site: { select: { id: true, name: true, url: true, isPublic: true } } },
    });

    if (account?.lockedUntil && account.lockedUntil > new Date()) {
      throw new HttpException('帳號暫時鎖定，請於 15 分鐘後再試。', HttpStatus.TOO_MANY_REQUESTS);
    }

    const passwordValid = await bcrypt.compare(dto.password, account?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!account || !passwordValid || !account.isActive) {
      if (account?.isActive) await this.recordFailedLogin(account.id, account.failedLoginCount);
      throw new UnauthorizedException('帳號或密碼錯誤。');
    }

    const now = new Date();
    await this.prisma.siteCmsAccount.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.prisma.siteCmsSession.updateMany({
      where: { accountId: account.id, expiresAt: { lte: now }, revokedAt: null },
      data: { revokedAt: now },
    });

    const session = await this.createSession(account.id);
    await this.audit(siteId, account.id, 'auth.login');
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      account: this.accountResponse(account),
      site: account.site,
    };
  }

  async authenticateToken(siteId: string, rawToken: string): Promise<SiteCmsContext> {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken)) throw new UnauthorizedException('CMS 工作階段無效。');
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.siteCmsSession.findUnique({
      where: { tokenHash },
      include: { account: true },
    });
    const now = new Date();
    if (
      !session
      || session.revokedAt
      || session.expiresAt <= now
      || !session.account.isActive
      || session.account.siteId !== siteId
    ) {
      throw new UnauthorizedException('CMS 工作階段已失效，請重新登入。');
    }
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      void this.prisma.siteCmsSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      }).catch(() => undefined);
    }
    return {
      accountId: session.account.id,
      sessionId: session.id,
      siteId: session.account.siteId,
      username: session.account.username,
      displayName: session.account.displayName,
      role: session.account.role,
      mustChangePassword: session.account.mustChangePassword,
    };
  }

  async me(context: SiteCmsContext) {
    return {
      id: context.accountId,
      username: context.username,
      displayName: context.displayName,
      role: context.role,
      siteId: context.siteId,
      mustChangePassword: context.mustChangePassword,
    };
  }

  async logout(context: SiteCmsContext) {
    await this.prisma.siteCmsSession.updateMany({
      where: { id: context.sessionId, accountId: context.accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(context.siteId, context.accountId, 'auth.logout');
    return { message: '已安全登出。' };
  }

  async changePassword(context: SiteCmsContext, dto: SiteCmsChangePasswordDto) {
    const account = await this.prisma.siteCmsAccount.findUnique({ where: { id: context.accountId } });
    if (!account || !account.isActive) throw new UnauthorizedException('CMS 帳號無效。');
    const valid = await bcrypt.compare(dto.currentPassword, account.passwordHash);
    if (!valid) throw new UnauthorizedException('目前密碼錯誤。');
    if (await bcrypt.compare(dto.newPassword, account.passwordHash)) {
      throw new BadRequestException('新密碼不可與目前密碼相同。');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.siteCmsAccount.update({
        where: { id: account.id },
        data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.siteCmsSession.updateMany({
        where: { accountId: account.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    const session = await this.createSession(account.id);
    await this.audit(context.siteId, context.accountId, 'auth.password_changed');
    return {
      message: '密碼已更新。',
      token: session.token,
      expiresAt: session.expiresAt,
      account: { ...this.accountResponse(account), mustChangePassword: false },
    };
  }

  async listArticles(context: SiteCmsContext, query: SiteCmsArticleQueryDto) {
    this.assertReady(context);
    const where: Prisma.SiteCmsArticleWhereInput = {
      siteId: context.siteId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.siteCmsArticle.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: this.articleSelect(),
      }),
      this.prisma.siteCmsArticle.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findArticle(context: SiteCmsContext, id: string) {
    this.assertReady(context);
    const article = await this.prisma.siteCmsArticle.findFirst({
      where: { id, siteId: context.siteId },
      select: this.articleSelect(),
    });
    if (!article) throw new NotFoundException('找不到文章。');
    return { ...article, quality: evaluateSiteCmsArticle(this.qualityInput(article)) };
  }

  previewArticle(context: SiteCmsContext, dto: SiteCmsArticlePreviewDto) {
    this.assertReady(context);
    return this.contentService.renderPreview(
      dto.content,
      dto.contentFormat as SiteCmsContentFormat,
      dto.customCss,
    );
  }

  async createArticle(context: SiteCmsContext, dto: CreateSiteCmsArticleDto) {
    this.assertReady(context);
    const data = this.normalizeArticleData(dto);
    try {
      const article = await this.prisma.siteCmsArticle.create({
        data: {
          siteId: context.siteId,
          title: dto.title.trim(),
          slug: dto.slug.trim().toLowerCase(),
          description: data.description || '',
          content: data.content || '',
          contentFormat: data.contentFormat || 'markdown',
          customCss: data.customCss || null,
          category: data.category || 'brand-news',
          tags: data.tags || [],
          keywords: data.keywords || [],
          coverImageUrl: data.coverImageUrl || null,
          coverAlt: data.coverAlt || null,
          author: data.author || context.displayName,
          reviewedBy: data.reviewedBy || null,
          keyTakeaways: data.keyTakeaways || [],
          faq: (data.faq || []) as unknown as Prisma.InputJsonValue,
          sources: (data.sources || []) as unknown as Prisma.InputJsonValue,
          featured: data.featured || false,
          createdById: context.accountId,
          updatedById: context.accountId,
        },
        select: this.articleSelect(),
      });
      await this.audit(context.siteId, context.accountId, 'article.created', article.id, { slug: article.slug });
      return { ...article, quality: evaluateSiteCmsArticle(this.qualityInput(article)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('此網址代稱已被使用。');
      }
      throw error;
    }
  }

  async updateArticle(context: SiteCmsContext, id: string, dto: UpdateSiteCmsArticleDto) {
    this.assertReady(context);
    const existing = await this.prisma.siteCmsArticle.findFirst({ where: { id, siteId: context.siteId } });
    if (!existing) throw new NotFoundException('找不到文章。');
    if (existing.status === 'published' && dto.slug && dto.slug !== existing.slug) {
      throw new BadRequestException('已發布文章不可變更網址代稱，請先下架。');
    }
    if (dto.contentFormat && dto.contentFormat !== existing.contentFormat && dto.content === undefined) {
      throw new BadRequestException('切換文章格式時必須同時提交文章正文。');
    }
    const normalized = this.normalizeArticleData(dto, existing.contentFormat as SiteCmsContentFormat);
    const result = await this.prisma.siteCmsArticle.updateMany({
      where: { id, siteId: context.siteId, version: dto.version },
      data: {
        ...normalized,
        updatedById: context.accountId,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new ConflictException('文章已被其他人更新，請重新載入後再修改。');
    const article = await this.prisma.siteCmsArticle.findUniqueOrThrow({
      where: { id },
      select: this.articleSelect(),
    });
    await this.audit(context.siteId, context.accountId, 'article.updated', article.id, { version: article.version });
    return { ...article, quality: evaluateSiteCmsArticle(this.qualityInput(article)) };
  }

  async publishArticle(context: SiteCmsContext, id: string, version: number) {
    this.assertReady(context);
    const existing = await this.prisma.siteCmsArticle.findFirst({
      where: { id, siteId: context.siteId },
      select: this.articleSelect(),
    });
    if (!existing) throw new NotFoundException('找不到文章。');
    const quality = evaluateSiteCmsArticle(this.qualityInput(existing));
    if (!quality.passed) {
      throw new BadRequestException({
        code: 'CMS_QUALITY_GATE_FAILED',
        message: '文章尚未通過 SEO/GEO 發布檢查。',
        quality,
      });
    }
    const result = await this.prisma.siteCmsArticle.updateMany({
      where: { id, siteId: context.siteId, version },
      data: {
        status: 'published',
        publishedAt: existing.publishedAt || new Date(),
        updatedById: context.accountId,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new ConflictException('文章版本已變更，請重新載入。');
    const article = await this.prisma.siteCmsArticle.findUniqueOrThrow({ where: { id }, select: this.articleSelect() });
    await this.audit(context.siteId, context.accountId, 'article.published', id, { slug: article.slug });
    return { ...article, quality };
  }

  async unpublishArticle(context: SiteCmsContext, id: string, version: number) {
    this.assertReady(context);
    const result = await this.prisma.siteCmsArticle.updateMany({
      where: { id, siteId: context.siteId, version, status: 'published' },
      data: { status: 'draft', updatedById: context.accountId, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException('文章狀態或版本已變更，請重新載入。');
    const article = await this.prisma.siteCmsArticle.findUniqueOrThrow({ where: { id }, select: this.articleSelect() });
    await this.audit(context.siteId, context.accountId, 'article.unpublished', id, { slug: article.slug });
    return article;
  }

  async deleteArticle(context: SiteCmsContext, id: string) {
    this.assertReady(context);
    if (context.role !== 'admin') throw new ForbiddenException('只有管理者可以刪除文章。');
    const article = await this.prisma.siteCmsArticle.findFirst({ where: { id, siteId: context.siteId } });
    if (!article) throw new NotFoundException('找不到文章。');
    if (article.status === 'published') throw new BadRequestException('請先下架文章再刪除。');
    await this.prisma.siteCmsArticle.delete({ where: { id } });
    await this.audit(context.siteId, context.accountId, 'article.deleted', null, { id, slug: article.slug });
    return { message: '文章已刪除。' };
  }

  async publicExport(siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, isPublic: true },
      select: { id: true, name: true, url: true, updatedAt: true },
    });
    if (!site) throw new NotFoundException('找不到公開站點。');
    const articles = await this.prisma.siteCmsArticle.findMany({
      where: { siteId, status: 'published', publishedAt: { not: null } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: this.articleSelect(),
    });
    return {
      site,
      generatedAt: new Date().toISOString(),
      articles: articles.filter((article) => evaluateSiteCmsArticle(this.qualityInput(article)).passed),
    };
  }

  assertReady(context: SiteCmsContext) {
    if (context.mustChangePassword) {
      throw new ForbiddenException({
        code: 'CMS_PASSWORD_CHANGE_REQUIRED',
        message: '首次登入必須先變更密碼。',
      });
    }
  }

  private async recordFailedLogin(accountId: string, currentCount: number) {
    const next = currentCount + 1;
    await this.prisma.siteCmsAccount.update({
      where: { id: accountId },
      data: next >= MAX_FAILED_LOGINS
        ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) }
        : { failedLoginCount: next },
    });
  }

  private async createSession(accountId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    await this.prisma.siteCmsSession.create({
      data: { accountId, tokenHash: this.hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private accountResponse(account: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    mustChangePassword: boolean;
  }) {
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      mustChangePassword: account.mustChangePassword,
    };
  }

  private normalizeList(values?: string[]) {
    if (!values) return undefined;
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private normalizeArticleData(
    dto: Partial<CreateSiteCmsArticleDto>,
    fallbackFormat: SiteCmsContentFormat = 'markdown',
  ) {
    const stringValue = (value: string | undefined) =>
      value === undefined ? undefined : value.trim();
    const contentFormat = (dto.contentFormat || fallbackFormat) as SiteCmsContentFormat;
    const faq = dto.faq?.map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }));
    const sources = dto.sources?.map((item) => ({ label: item.label.trim(), url: item.url.trim() }));
    return {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug.trim().toLowerCase() } : {}),
      ...(dto.description !== undefined ? { description: stringValue(dto.description) || '' } : {}),
      ...(dto.content !== undefined ? { content: this.contentService.sanitizeContent(dto.content, contentFormat) } : {}),
      ...(dto.contentFormat !== undefined ? { contentFormat } : {}),
      ...(dto.customCss !== undefined ? { customCss: this.contentService.sanitizeCss(dto.customCss) || null } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.tags !== undefined ? { tags: this.normalizeList(dto.tags) || [] } : {}),
      ...(dto.keywords !== undefined ? { keywords: this.normalizeList(dto.keywords) || [] } : {}),
      ...(dto.coverImageUrl !== undefined ? { coverImageUrl: stringValue(dto.coverImageUrl) || null } : {}),
      ...(dto.coverAlt !== undefined ? { coverAlt: stringValue(dto.coverAlt) || null } : {}),
      ...(dto.author !== undefined ? { author: stringValue(dto.author) || '' } : {}),
      ...(dto.reviewedBy !== undefined ? { reviewedBy: stringValue(dto.reviewedBy) || null } : {}),
      ...(dto.keyTakeaways !== undefined ? { keyTakeaways: this.normalizeList(dto.keyTakeaways) || [] } : {}),
      ...(dto.faq !== undefined ? { faq: (faq || []) as unknown as Prisma.InputJsonValue } : {}),
      ...(dto.sources !== undefined ? { sources: (sources || []) as unknown as Prisma.InputJsonValue } : {}),
      ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
    };
  }

  private qualityInput(article: Record<string, any>) {
    return {
      ...article,
      faq: (Array.isArray(article.faq) ? article.faq : []) as SiteCmsFaqDto[],
      sources: (Array.isArray(article.sources) ? article.sources : []) as SiteCmsSourceDto[],
    };
  }

  private articleSelect() {
    return {
      id: true,
      siteId: true,
      slug: true,
      title: true,
      description: true,
      content: true,
      contentFormat: true,
      customCss: true,
      category: true,
      tags: true,
      keywords: true,
      coverImageUrl: true,
      coverAlt: true,
      author: true,
      reviewedBy: true,
      keyTakeaways: true,
      faq: true,
      sources: true,
      featured: true,
      status: true,
      version: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async audit(
    siteId: string,
    accountId: string | null,
    action: string,
    articleId?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.siteCmsAuditLog.create({
      data: {
        siteId,
        accountId,
        articleId: articleId || null,
        action,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
