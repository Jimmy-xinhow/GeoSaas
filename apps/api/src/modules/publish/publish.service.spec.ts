import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishService } from './publish.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediumAdapter } from './adapters/medium.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { WordPressAdapter } from './adapters/wordpress.adapter';

describe('PublishService', () => {
  let service: PublishService;
  let prisma: {
    content: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    publication: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let configService: { get: jest.Mock };
  let mediumAdapter: { platform: string; publish: jest.Mock };
  let linkedInAdapter: { platform: string; publish: jest.Mock };
  let wordPressAdapter: { platform: string; publish: jest.Mock };

  const userId = 'user-1';
  const contentId = 'content-1';
  const mockContent = {
    id: contentId,
    userId,
    title: 'Test Article',
    body: '<p>Article body</p>',
    type: 'ARTICLE',
    status: 'DRAFT',
  };

  beforeEach(async () => {
    prisma = {
      content: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      publication: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    configService = { get: jest.fn().mockReturnValue('mock-config-value') };
    mediumAdapter = { platform: 'medium', publish: jest.fn() };
    linkedInAdapter = { platform: 'linkedin', publish: jest.fn() };
    wordPressAdapter = { platform: 'wordpress', publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: MediumAdapter, useValue: mediumAdapter },
        { provide: LinkedInAdapter, useValue: linkedInAdapter },
        { provide: WordPressAdapter, useValue: wordPressAdapter },
      ],
    }).compile();

    service = module.get<PublishService>(PublishService);
  });

  describe('publish', () => {
    it('should create publication records for each platform', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      const pub1 = { id: 'pub-1', contentId, platform: 'medium', status: 'PENDING' };
      const pub2 = { id: 'pub-2', contentId, platform: 'linkedin', status: 'PENDING' };
      prisma.publication.create
        .mockResolvedValueOnce(pub1)
        .mockResolvedValueOnce(pub2);

      // Mock adapter publish to prevent unhandled rejections in background
      mediumAdapter.publish.mockResolvedValue({ externalUrl: 'https://medium.com/article', externalId: 'ext-1' });
      linkedInAdapter.publish.mockResolvedValue({ externalUrl: 'https://linkedin.com/post', externalId: 'ext-2' });
      prisma.publication.update.mockResolvedValue({});

      const result = await service.publish(contentId, ['medium', 'linkedin'], userId);

      expect(prisma.content.findFirst).toHaveBeenCalledWith({
        where: { id: contentId, userId },
      });
      expect(prisma.publication.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe('medium');
      expect(result[1].platform).toBe('linkedin');
    });

    it('should throw NotFoundException when content does not exist', async () => {
      prisma.content.findFirst.mockResolvedValue(null);

      await expect(
        service.publish('nonexistent', ['medium'], userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle unknown platforms gracefully by skipping adapters', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      const pub = { id: 'pub-1', contentId, platform: 'unknown_platform', status: 'PENDING' };
      prisma.publication.create.mockResolvedValue(pub);

      const result = await service.publish(contentId, ['unknown_platform'], userId);

      expect(result).toHaveLength(1);
      // No adapter should be called for unknown platform
      expect(mediumAdapter.publish).not.toHaveBeenCalled();
      expect(linkedInAdapter.publish).not.toHaveBeenCalled();
      expect(wordPressAdapter.publish).not.toHaveBeenCalled();
    });

    it('should create publication records even when adapter publishing fails', async () => {
      prisma.content.findFirst.mockResolvedValue(mockContent);
      const pub = { id: 'pub-1', contentId, platform: 'medium', status: 'PENDING' };
      prisma.publication.create.mockResolvedValue(pub);

      // Adapter rejects, but publish() should still return the created publications
      mediumAdapter.publish.mockRejectedValue(new Error('API error'));
      prisma.publication.update.mockResolvedValue({});

      const result = await service.publish(contentId, ['medium'], userId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('PENDING');
    });
  });

  describe('findAll', () => {
    it('should return all publications for content owned by the user', async () => {
      prisma.content.findMany.mockResolvedValue([
        { id: 'c-1' },
        { id: 'c-2' },
      ]);
      const mockPublications = [
        { id: 'pub-1', contentId: 'c-1', platform: 'medium', content: { title: 'Art 1', type: 'ARTICLE' } },
      ];
      prisma.publication.findMany.mockResolvedValue(mockPublications);

      const result = await service.findAll(userId);

      expect(prisma.content.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true },
      });
      expect(prisma.publication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contentId: { in: ['c-1', 'c-2'] } },
        }),
      );
      expect(result).toEqual(mockPublications);
    });

    it('should return empty array when user has no content', async () => {
      prisma.content.findMany.mockResolvedValue([]);
      prisma.publication.findMany.mockResolvedValue([]);

      const result = await service.findAll(userId);

      expect(prisma.publication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contentId: { in: [] } },
        }),
      );
      expect(result).toEqual([]);
    });
  });
});
