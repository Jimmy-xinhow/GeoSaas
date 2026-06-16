import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertSiteAccess } from '../../common/auth/site-access';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai/ai.service';
import { ContentPromptContext } from './ai/prompts/prompt-context';
import { GenerateContentDto } from './dto/generate-content.dto';

type SiteProfileRecord = Record<string, unknown>;

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.content.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string, userId: string) {
    const content = await this.prisma.content.findFirst({ where: { id, userId } });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }

  assertAiConfigured() {
    this.aiService.assertConfigured();
  }

  async assertGenerateAccess(dto: GenerateContentDto, userId: string, role?: string) {
    if (!dto.siteId) throw new ForbiddenException('請先選擇要產生內容的品牌網站');
    await assertSiteAccess(this.prisma, dto.siteId, userId, role);
  }

  async assertGenerateReadiness(dto: GenerateContentDto) {
    const readiness = await this.getGenerateReadiness(dto.siteId);
    if (readiness.ready) return readiness;

    throw new BadRequestException({
      message: '品牌資料或知識庫不足，請先補齊後再生成內容；本次不會扣點，也不會呼叫 AI。',
      missingFields: readiness.missingFields,
      requiredFields: readiness.requiredFields,
    });
  }

  async generate(dto: GenerateContentDto, userId: string, role?: string) {
    await this.assertGenerateAccess(dto, userId, role);
    await this.assertGenerateReadiness(dto);

    const context = await this.buildPromptContext(dto);
    const language = dto.language || 'zh-TW';
    let body: string;
    let title: string;

    if (dto.type === 'FAQ') {
      body = await this.aiService.generateFaq(context);
      title = `${context.brandName} - GEO FAQ`;
    } else {
      body = await this.aiService.generateArticle(context);
      title = `${context.brandName} - ${context.keywords[0] || 'AI 搜尋品牌介紹'}`;
    }

    return this.prisma.content.create({
      data: {
        userId,
        siteId: dto.siteId,
        title,
        body,
        type: dto.type,
        language,
        status: 'DRAFT',
      },
    });
  }

  async update(id: string, data: { title?: string; body?: string; status?: any }, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.content.update({ where: { id }, data });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.content.delete({ where: { id } });
  }

  private async getGenerateReadiness(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        profile: true,
        qas: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 5,
          select: { question: true, answer: true },
        },
      },
    });

    if (!site) throw new NotFoundException('Site not found');

    const profile = this.asProfile(site.profile);
    const industry = site.industry || this.stringValue(profile.industry);
    const description = this.stringValue(profile.description);
    const services = this.stringValue(profile.services);
    const positioning = this.stringValue(profile.positioning) || this.stringValue(profile.uniqueValue);
    const targetAudiences = this.cleanStrings([
      ...this.arrayValue(profile.targetAudiences),
      ...this.splitList(this.stringValue(profile.targetAudience)),
    ]);
    const validQaCount = site.qas.filter((qa) =>
      qa.question.trim().length >= 5 && qa.answer.trim().length >= 20,
    ).length;

    const missingFields = [
      !site.name.trim() && '品牌名稱',
      !site.url.trim() && '官方網站',
      !industry && '產業分類',
      !description && '品牌描述',
      !services && '服務或產品說明',
      !positioning && '品牌定位或差異化',
      targetAudiences.length === 0 && '目標客群',
      validQaCount < 2 && '至少 2 組有效知識庫 Q&A',
    ].filter(Boolean) as string[];

    return {
      ready: missingFields.length === 0,
      missingFields,
      requiredFields: [
        '品牌名稱',
        '官方網站',
        '產業分類',
        '品牌描述',
        '服務或產品說明',
        '品牌定位或差異化',
        '目標客群',
        '至少 2 組有效知識庫 Q&A',
      ],
    };
  }

  private async buildPromptContext(dto: GenerateContentDto): Promise<ContentPromptContext> {
    const site = await this.prisma.site.findUnique({
      where: { id: dto.siteId },
      include: {
        qas: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 20,
        },
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!site) throw new NotFoundException('Site not found');

    const profile = this.asProfile(site.profile);
    const requestedKeywords = this.cleanStrings(dto.keywords || []);
    const profileKeywords = this.cleanStrings(this.arrayValue(profile.keywords));
    const categoryKeywords = this.cleanStrings(site.qas.map((qa) => qa.category || ''));
    const fallbackKeywords = this.cleanStrings([
      this.stringValue(profile.industry),
      site.industry,
      this.stringValue(profile.positioning),
    ]);

    const keywords = [...new Set([...requestedKeywords, ...profileKeywords, ...categoryKeywords, ...fallbackKeywords])]
      .slice(0, 8);

    return {
      brandName: site.name,
      siteUrl: site.url,
      industry: site.industry || this.stringValue(profile.industry),
      description: this.stringValue(profile.description),
      services: this.stringValue(profile.services),
      targetAudiences: this.cleanStrings([
        ...this.arrayValue(profile.targetAudiences),
        ...this.splitList(this.stringValue(profile.targetAudience)),
      ]),
      location: this.stringValue(profile.location),
      positioning: this.stringValue(profile.positioning) || this.stringValue(profile.uniqueValue),
      contact: this.stringValue(profile.contact) || this.stringValue(profile.contactInfo),
      keywords: keywords.length ? keywords : ['GEO 優化', 'AI 搜尋能見度'],
      qas: site.qas.map((qa) => ({
        question: qa.question,
        answer: qa.answer,
        category: qa.category,
      })),
      latestScore: site.scans[0]?.totalScore ?? null,
      language: dto.language || 'zh-TW',
    };
  }

  private asProfile(value: unknown): SiteProfileRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as SiteProfileRecord)
      : {};
  }

  private stringValue(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private arrayValue(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    const single = this.stringValue(value);
    return single ? [single] : [];
  }

  private splitList(value: string | null): string[] {
    if (!value) return [];
    return value
      .split(/[,，、;；\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private cleanStrings(values: Array<string | null | undefined>): string[] {
    return values
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);
  }
}
