import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSuccessCaseDto } from './dto/create-success-case.dto';
import {
  isIndexablePublicSuccessCase,
  isPublicSafeSite,
  publicSuccessCaseWhere,
} from '../../common/utils/public-data-filter';
import { assertSiteAccess, isAdminRole } from '../../common/auth/site-access';

@Injectable()
export class SuccessCasesService {
  private readonly logger = new Logger(SuccessCasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private isAdminRole(role: string) {
    return isAdminRole(role);
  }

  private async assertOwnsSite(userId: string, siteId?: string, role?: string): Promise<void> {
    if (!siteId) return;
    await assertSiteAccess(this.prisma, siteId, userId, role);
  }

  async create(userId: string, dto: CreateSuccessCaseDto, role?: string) {
    await this.assertOwnsSite(userId, dto.siteId, role);
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

    const where: any = publicSuccessCaseWhere({ status });
    if (aiPlatform) where.aiPlatform = aiPlatform;
    if (industry) where.industry = industry;

    const rows = await this.prisma.geoSuccessCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        title: true,
        aiPlatform: true,
        queryUsed: true,
        aiResponse: true,
        beforeGeoScore: true,
        afterGeoScore: true,
        improvementDays: true,
        industry: true,
        tags: true,
        viewCount: true,
        createdAt: true,
        user: { select: { name: true } },
        site: { select: { name: true, url: true, isPublic: true } },
      },
    });

    const filtered = rows.filter((item) => isIndexablePublicSuccessCase(item));
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit).map(({ aiResponse, ...item }) => item);

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

    const statusCounts: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    counts.forEach((count) => {
      statusCounts[count.status] = count._count._all;
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
    const rows = await this.prisma.geoSuccessCase.findMany({
      where: publicSuccessCaseWhere({ status: 'approved', featuredAt: { not: null } }),
      orderBy: { featuredAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        aiPlatform: true,
        queryUsed: true,
        aiResponse: true,
        beforeGeoScore: true,
        afterGeoScore: true,
        tags: true,
        createdAt: true,
        site: { select: { name: true, url: true, isPublic: true } },
      },
    });
    return rows
      .filter((item) => isIndexablePublicSuccessCase(item))
      .slice(0, 12)
      .map(({ aiResponse, ...item }) => item);
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

    if (
      !item ||
      item.status !== 'approved' ||
      !isIndexablePublicSuccessCase(item) ||
      item.title.toLowerCase().includes('codex qa') ||
      item.queryUsed.toLowerCase().includes('codex qa') ||
      item.aiResponse.toLowerCase().includes('codex qa') ||
      !isPublicSafeSite(item.site)
    ) {
      throw new NotFoundException('Case not found');
    }

    await this.prisma.geoSuccessCase.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    const similarRows = await this.prisma.geoSuccessCase.findMany({
      where: publicSuccessCaseWhere({
        status: 'approved',
        id: { not: item.id },
        OR: [
          { aiPlatform: item.aiPlatform },
          ...(item.industry ? [{ industry: item.industry }] : []),
        ],
      }),
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        aiPlatform: true,
        queryUsed: true,
        aiResponse: true,
        beforeGeoScore: true,
        afterGeoScore: true,
        industry: true,
        tags: true,
        createdAt: true,
        site: { select: { name: true, url: true, isPublic: true } },
      },
    });

    const similarCases = similarRows
      .filter((row) => isIndexablePublicSuccessCase(row))
      .slice(0, 3)
      .map(({ aiResponse, ...row }) => row);

    return { ...item, similarCases };
  }

  async update(caseId: string, userId: string, dto: Partial<CreateSuccessCaseDto>, role?: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.userId !== userId) throw new ForbiddenException('You cannot edit this case');
    if (existing.status !== 'pending') throw new ForbiddenException('Only pending cases can be edited');
    await this.assertOwnsSite(userId, dto.siteId, role);

    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { ...dto, tags: dto.tags || undefined },
    });
  }

  async delete(caseId: string, userId: string, role: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.userId !== userId && !this.isAdminRole(role)) {
      throw new ForbiddenException('You cannot delete this case');
    }

    await this.prisma.geoSuccessCase.delete({ where: { id: caseId } });
    return { deleted: true };
  }

  async approve(caseId: string) {
    const existing = await this.prisma.geoSuccessCase.findUnique({ where: { id: caseId } });
    if (!existing) throw new NotFoundException('Case not found');

    const updated = await this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { status: 'approved', rejectionReason: null },
    });

    this.notifications
      .create(
        updated.userId,
        'case_approved',
        '成功案例已通過',
        `你的成功案例「${updated.title}」已通過審核並公開。`,
      )
      .catch(() => {});

    if (!existing.generatedArticleId) {
      await this.generateCaseArticle(caseId).catch((err) => {
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

    this.notifications
      .create(
        updated.userId,
        'case_rejected',
        '成功案例未通過',
        `你的成功案例「${updated.title}」未通過審核。原因：${reason}`,
      )
      .catch(() => {});

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
      throw new ForbiddenException('Only approved cases can be featured');
    }

    return this.prisma.geoSuccessCase.update({
      where: { id: caseId },
      data: { featuredAt: existing.featuredAt ? null : new Date() },
    });
  }

  private buildCaseArticlePrompt(caseData: {
    title: string;
    queryUsed: string;
    aiPlatform: string;
    aiResponse: string;
    beforeGeoScore: number | null;
    afterGeoScore: number | null;
    improvementDays: number | null;
    tags: string[];
  }) {
    return `根據以下 GEO 成功案例，撰寫一篇 700-900 字的繁體中文案例故事文章。

案例標題：${caseData.title}
提問者問 AI：「${caseData.queryUsed}」
AI 平台：${caseData.aiPlatform}
AI 回應摘要：${caseData.aiResponse.slice(0, 500)}
優化前分數：${caseData.beforeGeoScore ?? '未知'} -> 優化後：${caseData.afterGeoScore ?? '未知'}
花費天數：${caseData.improvementDays ?? '未知'}
使用的技術：${caseData.tags.join(', ') || '未提供'}

文章結構：
## ${caseData.title}

### 背景
### 他們做了什麼
### AI 真的引用了
### 關鍵技術要點
### 給你的建議
### 常見問題
Q: 這個成功案例可以複製嗎？
A: （回答）
Q: 需要多少技術能力才能做到？
A: （回答）`;
  }

  private buildFallbackCaseArticle(caseData: {
    title: string;
    queryUsed: string;
    aiPlatform: string;
    aiResponse: string;
    beforeGeoScore: number | null;
    afterGeoScore: number | null;
    improvementDays: number | null;
    tags: string[];
  }) {
    const scoreLine =
      caseData.beforeGeoScore != null && caseData.afterGeoScore != null
        ? `${caseData.beforeGeoScore} 分提升到 ${caseData.afterGeoScore} 分`
        : '完成了一輪 GEO 優化';
    const daysLine = caseData.improvementDays ? `，約 ${caseData.improvementDays} 天內完成` : '';
    const tagLine = caseData.tags.length > 0 ? caseData.tags.join('、') : '結構化資料、內容完整性與 AI 可讀性';

    return `## ${caseData.title}

### 背景
這是一則由使用者提交並通過審核的 GEO 成功案例。案例中的品牌透過 Geovault 追蹤 AI 搜尋能見度，並觀察到 ${caseData.aiPlatform} 在特定提問情境中提及品牌。

使用者測試的問題是：「${caseData.queryUsed}」。這類問題通常代表潛在客戶正在請 AI 協助比較、推薦或理解服務，因此能否被 AI 正確引用，會直接影響品牌在新搜尋入口中的曝光。

### 他們做了什麼
這個案例的核心改善方向是提高網站與品牌資料的機器可讀性。根據提交資料，主要使用的技術包含：${tagLine}。這些項目可以幫助 AI 更穩定地理解品牌名稱、服務內容、網站可信度與常見問題。

在分數表現上，該案例從 ${scoreLine}${daysLine}。分數提升本身不是唯一目標，但它代表網站在結構化、可讀性與引用線索上更完整，能降低 AI 抓不到重點或引用競品的風險。

### AI 真的引用了
使用者提供的 AI 回應摘要如下：

${caseData.aiResponse}

這段回應顯示，AI 已能在相關問題中辨識並提到該品牌。對品牌而言，這不是傳統 SEO 的排名結果，而是進入 AI 回答內容的一次可觀察訊號。

### 關鍵技術要點
首先，結構化資料能讓 AI 與搜尋系統更容易理解網站的主體、服務與聯絡資訊。其次，llms.txt 或明確的 AI 可讀資料能提供更直接的品牌摘要。最後，FAQ 與知識庫內容能補足使用者常問問題，讓 AI 在回答時有更具體的引用材料。

### 給你的建議
1. 先補齊網站的基礎 GEO 指標，尤其是 JSON-LD、Meta Description、OG Tags 與 llms.txt。
2. 建立品牌知識庫，把服務、價格、地區、適合對象與常見問題整理成清楚問答。
3. 每次優化後重新掃描，並用真實 AI 查詢追蹤品牌是否開始被提及。

### 常見問題
Q: 這個成功案例可以複製嗎？
A: 可以複製方法，但結果會依產業競爭度、網站內容完整度與 AI 平台資料更新速度而不同。建議先從可控的技術指標與知識庫開始。

Q: 需要多少技術能力才能做到？
A: 基礎項目需要能修改網站標籤或安裝外掛；內容與知識庫則可以由營運或行銷人員先整理，再交由工程或網站管理者上線。`;
  }

  private buildCaseArticleSlug(caseData: {
    id: string;
    aiPlatform: string;
    industry: string | null;
  }) {
    const slugParts = ['case', caseData.aiPlatform];
    if (caseData.industry) slugParts.push(caseData.industry);
    slugParts.push(caseData.id.slice(0, 10));
    return slugParts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async generateCaseArticle(caseId: string) {
    const caseData = await this.prisma.geoSuccessCase.findUnique({
      where: { id: caseId },
    });

    if (!caseData) throw new NotFoundException('Case not found');
    if (caseData.generatedArticleId) {
      const existingArticle = await this.prisma.blogArticle.findUnique({
        where: { id: caseData.generatedArticleId },
      });
      if (existingArticle) return existingArticle;
    }

    let content = '';
    try {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [{ role: 'user', content: this.buildCaseArticlePrompt(caseData) }],
      });

      content = completion.choices[0]?.message?.content?.trim() || '';
      if (content.length < 200) {
        throw new Error('Generated case article was empty or too short');
      }
    } catch (error) {
      this.logger.warn(
        `Using fallback case article for ${caseId}: ${error instanceof Error ? error.message : error}`,
      );
      content = this.buildFallbackCaseArticle(caseData);
    }

    const slug = this.buildCaseArticleSlug(caseData);

    const article = await this.prisma.blogArticle.create({
      data: {
        slug,
        title: caseData.title,
        description: `GEO 成功案例：${caseData.title} 在 ${caseData.aiPlatform} 被引用`,
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
