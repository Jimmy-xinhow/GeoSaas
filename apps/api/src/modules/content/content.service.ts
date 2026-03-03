import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai/ai.service';
import { GenerateContentDto } from './dto/generate-content.dto';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService, private aiService: AiService) {}

  async findAll(userId: string) {
    return this.prisma.content.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string, userId: string) {
    const content = await this.prisma.content.findFirst({ where: { id, userId } });
    if (!content) throw new NotFoundException('Content not found');
    return content;
  }

  async generate(dto: GenerateContentDto, userId: string) {
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
