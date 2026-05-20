import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai/ai.service';
import { ContentService } from './content.service';

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
    site: {
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
  const siteId = 'site-1';
  const mockContent = {
    id: contentId,
    userId,
    siteId,
    title: 'Test Content',
    body: '<p>Test body</p>',
    type: 'ARTICLE',
    language: 'zh-TW',
    status: 'DRAFT',
    createdAt: new Date(),
  };
  const siteAccess = { id: siteId, userId, isClient: false };
  const siteWithKnowledge = {
    id: siteId,
    userId,
    isClient: false,
    name: 'Acme Corp',
    url: 'https://acme.example',
    industry: 'Tech',
    profile: {
      description: 'AI visibility platform',
      services: 'GEO audits and content',
      positioning: 'Helps brands become easier for AI assistants to cite.',
      targetAudiences: ['B2B marketing teams'],
      keywords: ['GEO', 'SEO'],
    },
    qas: [
      {
        question: 'What does Acme do?',
        answer: 'Acme helps brands improve AI search visibility.',
        category: 'brand',
      },
      {
        question: 'Who is Acme for?',
        answer: 'Acme is for marketing teams that need verified brand facts for AI search.',
        category: 'audience',
      },
    ],
    scans: [{ totalScore: 82 }],
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
      site: {
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
        { provide: AiService, useValue: aiService },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  function mockSiteAccess(site = siteWithKnowledge) {
    prisma.site.findUnique
      .mockResolvedValueOnce(siteAccess)
      .mockResolvedValueOnce(site)
      .mockResolvedValueOnce(site);
  }

  describe('assertAiConfigured', () => {
    it('delegates configuration checks to the AI service', () => {
      service.assertAiConfigured();

      expect(aiService.assertConfigured).toHaveBeenCalled();
    });

    it('surfaces AI configuration errors before generation side effects', () => {
      aiService.assertConfigured.mockImplementation(() => {
        throw new Error('OPENAI_API_KEY is not configured');
      });

      expect(() => service.assertAiConfigured()).toThrow('OPENAI_API_KEY is not configured');
    });
  });

  describe('findAll', () => {
    it('returns all content for a user', async () => {
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
    it('returns content when it exists', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);

      const result = await service.findOne(contentId, userId);

      expect(result).toEqual(mockContent);
    });

    it('throws NotFoundException when content does not exist', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('generate', () => {
    it('generates FAQ content from the selected site knowledge base', async () => {
      mockSiteAccess();
      aiService.generateFaq.mockResolvedValue('<h2>FAQ</h2>');
      prisma.content.create.mockResolvedValue({ ...mockContent, type: 'FAQ', title: 'Acme Corp - GEO FAQ' });

      const result = await service.generate(
        { type: 'FAQ', siteId, keywords: ['AI', 'SEO'], language: 'zh-TW' },
        userId,
        'USER',
      );

      expect(aiService.generateFaq).toHaveBeenCalledWith(
        expect.objectContaining({
          brandName: 'Acme Corp',
          siteUrl: 'https://acme.example',
          industry: 'Tech',
          latestScore: 82,
          keywords: expect.arrayContaining(['AI', 'SEO', 'GEO']),
          qas: expect.arrayContaining([
            expect.objectContaining({ question: 'What does Acme do?' }),
          ]),
        }),
      );
      expect(prisma.content.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          siteId,
          type: 'FAQ',
          title: 'Acme Corp - GEO FAQ',
          status: 'DRAFT',
        }),
      });
      expect(result.type).toBe('FAQ');
    });

    it('generates article content from the selected site knowledge base', async () => {
      mockSiteAccess();
      aiService.generateArticle.mockResolvedValue('<h1>Article</h1>');
      prisma.content.create.mockResolvedValue({ ...mockContent, title: 'Acme Corp - GEO' });

      const result = await service.generate({ type: 'ARTICLE', siteId, keywords: ['GEO', 'SEO'] }, userId, 'USER');

      expect(aiService.generateArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          brandName: 'Acme Corp',
          keywords: expect.arrayContaining(['GEO', 'SEO']),
          language: 'zh-TW',
        }),
      );
      expect(result.type).toBe('ARTICLE');
    });

    it('uses derived brand keywords when the user leaves focus blank', async () => {
      mockSiteAccess({
        ...siteWithKnowledge,
        profile: {
          description: 'AI visibility platform',
          services: 'GEO audits and content',
          positioning: 'Helps brands become easier for AI assistants to cite.',
          targetAudiences: ['B2B marketing teams'],
        },
      });
      aiService.generateArticle.mockResolvedValue('body');
      prisma.content.create.mockResolvedValue(mockContent);

      await service.generate({ type: 'ARTICLE', siteId, keywords: [] }, userId, 'USER');

      expect(prisma.content.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Acme Corp - brand',
        }),
      });
    });

    it('blocks generation before calling AI when brand facts are incomplete', async () => {
      prisma.site.findUnique
        .mockResolvedValueOnce(siteAccess)
        .mockResolvedValueOnce({
          ...siteWithKnowledge,
          industry: null,
          profile: {},
          qas: [],
        });

      try {
        await service.generate({ type: 'ARTICLE', siteId, keywords: [] }, userId, 'USER');
        throw new Error('Expected generation to be blocked');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          message: '品牌資料或知識庫不足，請先補齊後再生成內容；本次不會扣點，也不會呼叫 AI。',
          missingFields: expect.arrayContaining(['產業分類', '品牌描述', '至少 2 組有效知識庫 Q&A']),
        });
      }

      expect(aiService.generateArticle).not.toHaveBeenCalled();
      expect(prisma.content.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates content when it exists', async () => {
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

    it('throws NotFoundException when updating non-existent content', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(service.update('nonexistent', { title: 'X' }, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes content when it exists', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      prisma.content.delete.mockResolvedValue(mockContent);

      const result = await service.remove(contentId, userId);

      expect(prisma.content.delete).toHaveBeenCalledWith({ where: { id: contentId } });
      expect(result).toEqual(mockContent);
    });

    it('throws NotFoundException when deleting non-existent content', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });
  });
});
