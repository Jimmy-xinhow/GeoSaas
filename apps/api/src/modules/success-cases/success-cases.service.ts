import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSuccessCaseDto } from './dto/create-success-case.dto';
import OpenAI from 'openai';

@Injectable()
export class SuccessCasesService {
  private readonly logger = new Logger(SuccessCasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  async approve(caseId: string) {
    const updated = await this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { status: 'approved', featuredAt: new Date() },
    });

    // Generate article in background
    this.generateCaseArticle(caseId).catch((err) => {
      this.logger.warn(`Failed to generate article for case ${caseId}: ${err}`);
    });

    return updated;
  }

  async reject(caseId: string, reason: string) {
    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { status: 'rejected', rejectionReason: reason },
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
    const slug = `case-${caseData.title.slice(0, 20).replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').toLowerCase()}-${Date.now().toString(36)}`;

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
