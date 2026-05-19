import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SitesService } from './sites.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowService } from '../indexnow/indexnow.service';

describe('SitesService', () => {
  let service: SitesService;
  let prisma: {
    site: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  const userId = 'user-1';
  const siteId = 'site-1';
  const mockSite = {
    id: siteId,
    userId,
    name: 'Test Site',
    url: 'https://example.com',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      site: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanUsageService, useValue: { checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }) } },
        { provide: IndexNowService, useValue: { submitUrl: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<SitesService>(SitesService);
  });

  describe('create', () => {
    it('should create a site for the given user', async () => {
      const dto = { name: 'Test Site', url: 'https://example.com' };
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'FREE', role: 'USER' });
      prisma.site.create.mockResolvedValue({ ...mockSite, ...dto });

      const result = await service.create(dto as any, userId);

      expect(prisma.site.create).toHaveBeenCalledWith({
        data: { ...dto, url: 'https://example.com/', userId },
      });
      expect(result.name).toBe('Test Site');
    });

    it('should reject private or local site URLs before creating records', async () => {
      await expect(
        service.create({ name: 'Local Site', url: 'http://127.0.0.1:4000' } as any, userId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.site.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all sites for a user with scans and counts', async () => {
      prisma.site.findMany.mockResolvedValue([mockSite]);

      const result = await service.findAll(userId);

      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should return an empty array when user has no sites', async () => {
      prisma.site.findMany.mockResolvedValue([]);

      const result = await service.findAll(userId);

      expect(result).toEqual([]);
    });

    it('should return owned and client-tagged sites for staff users', async () => {
      prisma.site.findMany.mockResolvedValue([mockSite]);

      await service.findAll(userId, 'STAFF');

      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ userId }, { isClient: true }] },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a site when it exists and belongs to the user', async () => {
      prisma.site.findFirst.mockResolvedValue(mockSite);

      const result = await service.findOne(siteId, userId);

      expect(result).toEqual(mockSite);
      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: siteId, userId },
        }),
      );
    });

    it('should let staff open client-tagged sites', async () => {
      prisma.site.findFirst.mockResolvedValue({ ...mockSite, userId: 'client-owner', isClient: true });

      await service.findOne(siteId, userId, 'STAFF');

      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: siteId, OR: [{ userId }, { isClient: true }] },
        }),
      );
    });

    it('should throw NotFoundException when site does not exist', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return the site when it exists', async () => {
      prisma.site.findFirst.mockResolvedValue(mockSite);
      const updatedSite = { ...mockSite, name: 'Updated Site' };
      prisma.site.update.mockResolvedValue(updatedSite);

      const result = await service.update(siteId, { name: 'Updated Site' } as any, userId);

      expect(prisma.site.update).toHaveBeenCalledWith({
        where: { id: siteId },
        data: { name: 'Updated Site' },
      });
      expect(result.name).toBe('Updated Site');
    });

    it('should reject private or local site URLs when updating', async () => {
      prisma.site.findFirst.mockResolvedValue(mockSite);

      await expect(
        service.update(siteId, { url: 'http://10.0.0.1' } as any, userId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.site.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating a non-existent site', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Updated' } as any, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the site when it exists', async () => {
      prisma.site.findFirst.mockResolvedValue(mockSite);
      prisma.site.delete.mockResolvedValue(mockSite);

      const result = await service.remove(siteId, userId);

      expect(prisma.site.delete).toHaveBeenCalledWith({
        where: { id: siteId },
      });
      expect(result).toEqual(mockSite);
    });

    it('should throw NotFoundException when deleting a non-existent site', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
