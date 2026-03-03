import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SitesService } from './sites.service';
import { PrismaService } from '../../prisma/prisma.service';

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SitesService>(SitesService);
  });

  describe('create', () => {
    it('should create a site for the given user', async () => {
      const dto = { name: 'Test Site', url: 'https://example.com' };
      prisma.site.create.mockResolvedValue({ ...mockSite, ...dto });

      const result = await service.create(dto as any, userId);

      expect(prisma.site.create).toHaveBeenCalledWith({
        data: { ...dto, userId },
      });
      expect(result.name).toBe('Test Site');
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
