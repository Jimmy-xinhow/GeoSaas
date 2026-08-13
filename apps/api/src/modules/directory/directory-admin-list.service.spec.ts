jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { DirectoryService } from './directory.service';

describe('DirectoryService admin site list', () => {
  it('searches every site without applying the public directory boundary', async () => {
    const privateSite = {
      id: 'monster-factory',
      name: '怪獸工廠',
      url: 'https://monster.example',
      isPublic: false,
    };
    const prisma = {
      site: {
        findMany: jest.fn().mockResolvedValue([privateSite]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new DirectoryService(prisma as any);

    const result = await service.listAdminSites({
      search: '怪獸工廠',
      page: 1,
      limit: 20,
    });

    expect(prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { name: { contains: '怪獸工廠', mode: 'insensitive' } },
          { url: { contains: '怪獸工廠', mode: 'insensitive' } },
        ],
      },
      skip: 0,
      take: 20,
    }));
    expect(prisma.site.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: '怪獸工廠', mode: 'insensitive' } },
          { url: { contains: '怪獸工廠', mode: 'insensitive' } },
        ],
      },
    });
    expect(result).toEqual({
      items: [privateSite],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });
});
