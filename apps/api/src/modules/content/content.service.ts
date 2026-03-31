import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { AiService } from './ai/ai.service';
import { GenerateContentDto } from './dto/generate-content.dto';

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private planUsage: PlanUsageService,
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

  async generate(dto: GenerateContentDto, userId: string) {
    // Check plan limit: contentPerMonth
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const check = await this.planUsage.checkAndIncrement(userId, 'contentPerMonth', user.plan, user.role);
    if (!check.allowed) {
      throw new ForbiddenException(
        `已達本月內容生成額度上限（${check.used}/${check.limit}）。請升級方案以繼續使用。`,
      );
    }

    const language = dto.language || 'zh-TW';
    let body: string;
    let title: string;

    if (dto.type === 'FAQ') {
      body = await this.aiService.generateFaq(dto.brandName, dto.industry || '', dto.keywords, language);
      title = `${dto.brandName} - 常見問題`;
    } else {
      body = await this.aiService.generateArticle(dto.brandName, dto.keywords[0] || '', dto.keywords, language);
      title = `${dto.brandName} - ${dto.keywords[0] || '品牌文章'}`;
    }

    return this.prisma.content.create({
      data: { userId, title, body, type: dto.type, language, status: 'DRAFT' },
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
}
