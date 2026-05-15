import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentService } from './content.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { AiService } from './ai/ai.service';

describe('ContentService', () => {
  let service: ContentService;
  let prisma: {
    content: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };
  let aiService: {
    assertConfigured: jest.Mock;
    generateFaq: jest.Mock;
    generateArticle: jest.Mock;
  };

  const userId = 'user-1';
  const contentId = 'content-1';
  const mockContent = {
    id: contentId,
    userId,
    title: 'Test Content',
    body: '<p>Test body</p>',
    type: 'ARTICLE',
    language: 'zh-TW',
    status: 'DRAFT',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      content: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    aiService = {
      assertConfigured: jest.fn(),
      generateFaq: jest.fn(),
      generateArticle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PlanUsageService,
          useValue: {
            checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }),
          },
        },
        { provide: AiService, useValue: aiService },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  describe('assertAiConfigured', () => {
    it('should delegate configuration checks to the AI service', () => {
      service.assertAiConfigured();

      expect(aiService.assertConfigured).toHaveBeenCalled();
    });

    it('should surface AI configuration errors before generation side effects', () => {
      aiService.assertConfigured.mockImplementation(() => {
        throw new Error('OPENAI_API_KEY is not configured');
      });

      expect(() => service.assertAiConfigured()).toThrow('OPENAI_API_KEY is not configured');
    });
  });

  describe('findAll', () => {
    it('should return all content for a user', async () => {
      prisma.content.findMany.mockResolvedValue([mockContent]);

      const result = await service.findAll(userId);

      expect(prisma.content.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return content when it exists', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);

      const result = await service.findOne(contentId, userId);

      expect(result).toEqual(mockContent);
    });

    it('should throw NotFoundException when content does not exist', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generate', () => {
    it('should generate FAQ content when type is FAQ', async () => {
      const faqBody = '<h2>FAQ</h2><p>Question 1...</p>';
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'FREE', role: 'USER' });
      aiService.generateFaq.mockResolvedValue(faqBody);
      prisma.content.create.mockResolvedValue({
        ...mockContent,
        type: 'FAQ',
        title: 'Acme Corp - 常見問題',
        body: faqBody,
      });

      const dto = {
        type: 'FAQ' as const,
        brandName: 'Acme Corp',
        industry: 'Tech',
        keywords: ['AI', 'SEO'],
        language: 'zh-TW',
      };

      const result = await service.generate(dto, userId);

      expect(aiService.generateFaq).toHaveBeenCalledWith('Acme Corp', 'Tech', ['AI', 'SEO'], 'zh-TW');
      expect(prisma.content.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: 'FAQ',
          title: 'Acme Corp - 常見問題',
          status: 'DRAFT',
        }),
      });
      expect(result.type).toBe('FAQ');
    });

    it('should generate ARTICLE content when type is ARTICLE', async () => {
      const articleBody = '<h1>Article</h1><p>Content...</p>';
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'FREE', role: 'USER' });
      aiService.generateArticle.mockResolvedValue(articleBody);
      prisma.content.create.mockResolvedValue({
        ...mockContent,
        type: 'ARTICLE',
        title: 'Acme Corp - GEO',
        body: articleBody,
      });

      const dto = {
        type: 'ARTICLE' as const,
        brandName: 'Acme Corp',
        keywords: ['GEO', 'SEO'],
      };

      const result = await service.generate(dto, userId);

      expect(aiService.generateArticle).toHaveBeenCalledWith('Acme Corp', 'GEO', ['GEO', 'SEO'], 'zh-TW');
      expect(result.type).toBe('ARTICLE');
    });

    it('should use default language zh-TW when language is not specified', async () => {
      aiService.generateArticle.mockResolvedValue('body');
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'FREE', role: 'USER' });
      prisma.content.create.mockResolvedValue(mockContent);

      const dto = {
        type: 'ARTICLE' as const,
        brandName: 'Test',
        keywords: ['keyword'],
      };

      await service.generate(dto, userId);

      expect(aiService.generateArticle).toHaveBeenCalledWith(
        'Test',
        'keyword',
        ['keyword'],
        'zh-TW',
      );
    });

    it('should use fallback title when keywords array is empty for ARTICLE', async () => {
      aiService.generateArticle.mockResolvedValue('body');
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'FREE', role: 'USER' });
      prisma.content.create.mockResolvedValue(mockContent);

      const dto = {
        type: 'ARTICLE' as const,
        brandName: 'Acme',
        keywords: [],
      };

      await service.generate(dto, userId);

      expect(prisma.content.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Acme - 品牌文章',
        }),
      });
    });
  });

  describe('update', () => {
    it('should update content when it exists', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      const updated = { ...mockContent, title: 'Updated Title' };
      prisma.content.update.mockResolvedValue(updated);

      const result = await service.update(contentId, { title: 'Updated Title' }, userId);

      expect(prisma.content.update).toHaveBeenCalledWith({
        where: { id: contentId },
        data: { title: 'Updated Title' },
      });
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException when updating non-existent content', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { title: 'X' }, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete content when it exists', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      prisma.content.delete.mockResolvedValue(mockContent);

      const result = await service.remove(contentId, userId);

      expect(prisma.content.delete).toHaveBeenCalledWith({
        where: { id: contentId },
      });
      expect(result).toEqual(mockContent);
    });

    it('should throw NotFoundException when deleting non-existent content', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
