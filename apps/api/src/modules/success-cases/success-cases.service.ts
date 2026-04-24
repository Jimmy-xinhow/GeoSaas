import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSuccessCaseDto } from './dto/create-success-case.dto';
import OpenAI from 'openai';

@Injectable()
export class SuccessCasesService {
  private readonly logger = new Logger(SuccessCasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateSuccessCaseDto) {
    return this.prisma.geoSuccessCase.create({
      data: {
        userId,
        ...dto,
        tags: dto.tags || [],
        status: 'pending',
      },
    });
  }

  async findAll(filters: {
    status?: string;
    aiPlatform?: string;
    industry?: string;
    page?: number;
    limit?: number;
  }) {
    const { status = 'approved', aiPlatform, industry, page = 1, limit = 12 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { status };
    if (aiPlatform) where.aiPlatform = aiPlatform;
    if (industry) where.industry = industry;

    const [items, total] = await Promise.all([
      this.prisma.geoSuccessCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          aiPlatform: true,
          queryUsed: true,
          beforeGeoScore: true,
          afterGeoScore: true,
          improvementDays: true,
          industry: true,
          tags: true,
          viewCount: true,
          createdAt: true,
          user: { select: { name: true } },
          site: { select: { name: true, url: true } },
        },
      }),
      this.prisma.geoSuccessCase.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminFindAll(filters: {
    status?: string;
    aiPlatform?: string;
    industry?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, aiPlatform, industry, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (aiPlatform) where.aiPlatform = aiPlatform;
    if (industry) where.industry = industry;

    const [items, total, counts] = await Promise.all([
      this.prisma.geoSuccessCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          aiPlatform: true,
          queryUsed: true,
          beforeGeoScore: true,
          afterGeoScore: true,
          improvementDays: true,
          industry: true,
          tags: true,
          status: true,
          rejectionReason: true,
          featuredAt: true,
          screenshotUrl: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          site: { select: { id: true, name: true, url: true } },
          generatedArticle: { select: { id: true, slug: true, title: true } },
        },
      }),
      this.prisma.geoSuccessCase.count({ where }),
      this.prisma.geoSuccessCase.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const statusCounts = {
      pending: 0,
      approved: 0,
      rejected: 0,
    } as Record<string, number>;
    counts.forEach((c) => {
      statusCounts[c.status] = c._count._all;
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      statusCounts,
    };
  }

  async adminFindById(id: string) {
    const item = await this.prisma.geoSuccessCase.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        site: { select: { id: true, name: true, url: true, bestScore: true } },
        generatedArticle: { select: { id: true, slug: true, title: true, content: true } },
      },
    });
    if (!item) throw new NotFoundException('Case not found');
    return item;
  }

  async findFeatured() {
    return this.prisma.geoSuccessCase.findMany({
      where: { status: 'approved', featuredAt: { not: null } },
      orderBy: { featuredAt: 'desc' },
      take: 12,
      select: {
        id: true,
        title: true,
        aiPlatform: true,
        queryUsed: true,
        beforeGeoScore: true,
        afterGeoScore: true,
        tags: true,
        createdAt: true,
        site: { select: { name: true, url: true } },
      },
    });
  }

  async findById(id: string) {
    const item = await this.prisma.geoSuccessCase.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        site: { select: { name: true, url: true, bestScore: true } },
        generatedArticle: { select: { slug: true, title: true, content: true } },
      },
    });

    if (!item) throw new NotFoundException('Case not found');

    // Increment view count
    await this.prisma.geoSuccessCase.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return item;
  }

  async update(caseId: string, userId: string, dto: Partial<CreateSuccessCaseDto>) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.userId !== userId) throw new ForbiddenException('只能編輯自己的案例');
    if (existing.status !== 'pending') throw new ForbiddenException('只能編輯審核中的案例');

    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { ...dto, tags: dto.tags || undefined },
    });
  }

  async delete(caseId: string, userId: string, role: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.userId !== userId && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('無權刪除此案例');
    }

    await this.prisma.geoSuccessCase.delete({ where: { id: caseId } });
    return { deleted: true };
  }

  async approve(caseId: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');

    const updated = await this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      // Approve only flips status + clears any prior rejection reason.
      // Featured is a separate curated action via toggleFeatured.
      data: { status: 'approved', rejectionReason: null },
    });

    this.notifications.create(
      updated.userId,
      'case_approved',
      '案例審核通過',
      `您提交的案例「${updated.title}」已通過審核，將出現在成功案例頁面。`,
    ).catch(() => {});

    // Only generate an article the first time a case is approved.
    if (!existing.generatedArticleId) {
      this.generateCaseArticle(caseId).catch((err) => {
        this.logger.warn(`Failed to generate article for case ${caseId}: ${err}`);
      });
    }

    return updated;
  }

  async reject(caseId: string, reason: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');

    const updated = await this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { status: 'rejected', rejectionReason: reason, featuredAt: null },
    });

    this.notifications.create(
      updated.userId,
      'case_rejected',
      '案例審核未通過',
      `您提交的案例「${updated.title}」未通過審核。原因：${reason}`,
    ).catch(() => {});

    return updated;
  }

  async resetToPending(caseId: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');

    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { status: 'pending', rejectionReason: null, featuredAt: null },
    });
  }

  async toggleFeatured(caseId: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.status !== 'approved') {
      throw new ForbiddenException('只有已通過的案例才能設為精選');
    }

    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { featuredAt: existing.featuredAt ? null : new Date() },
    });
  }

  async generateCaseArticle(caseId: string) {
    const caseData = await this.prisma.geoSuccessCase.findUnique({
      where: { id: caseId },
    });

    if (!caseData) throw new NotFoundException('Case not found');

    const openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });

    const prompt = `根據以下 GEO 成功案例，撰寫一篇 700–900 字的繁體中文案例故事文章。

案例標題：${caseData.title}
提問者問 AI：「${caseData.queryUsed}」
AI 平台：${caseData.aiPlatform}
AI 回應摘要：${caseData.aiResponse.slice(0, 500)}
優化前分數：${caseData.beforeGeoScore ?? '未知'} → 優化後：${caseData.afterGeoScore ?? '未知'}
花費天數：${caseData.improvementDays ?? '未知'}
使用的技術：${caseData.tags.join(', ') || '未標記'}

文章結構：
## ${caseData.title}
### 背景
### 他們做了什麼
### AI 真的引用了
### 關鍵技術要點
### 給你的建議（3 個具體行動建議）
### 常見問題
Q: 這個成功案例可以複製嗎？
Q: 需要多少技術能力才能做到？`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || '';
    // ASCII-only slug: AI crawlers (GPTBot / ClaudeBot) and search engines
    // cannot key off percent-encoded CJK characters. Keep platform / industry
    // as readable tags, trail with the case id prefix for uniqueness.
    const slugParts = ['case', caseData.aiPlatform];
    if (caseData.industry) slugParts.push(caseData.industry);
    slugParts.push(caseData.id.slice(0, 10));
    const slug = slugParts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title: caseData.title,
        description: `GEO 成功案例：${caseData.title} — ${caseData.aiPlatform} 平台引用實錄`,
        content,
        category: 'case-study',
        templateType: 'geo_overview',
        siteId: caseData.siteId,
        published: true,
        readTime: '4 分鐘',
        readingTimeMinutes: 4,
      },
    });

    await this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { generatedArticleId: article.id },
    });

    this.logger.log(`Generated article for case ${caseId}: ${slug}`);
    return article;
  }
}
