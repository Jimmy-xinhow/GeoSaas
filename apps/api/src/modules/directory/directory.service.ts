import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { TogglePublicDto } from './dto/toggle-public.dto';

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDirectory(query: QueryDirectoryDto) {
    const { search, industry, tier, minScore, page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isPublic: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (industry) where.industry = industry;
    if (tier) where.tier = tier;
    if (minScore !== undefined) where.bestScore = { gte: minScore };

    const [items, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        select: {
          id: true,
          name: true,
          url: true,
          industry: true,
          tier: true,
          bestScore: true,
          bestScoreAt: true,
          createdAt: true,
        },
        orderBy: { bestScore: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.site.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLeaderboard() {
    return this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
      },
      orderBy: { bestScore: 'desc' },
      take: 10,
    });
  }

  async getStats() {
    const [totalSites, avgResult, tierCounts] = await Promise.all([
      this.prisma.site.count({ where: { isPublic: true } }),
      this.prisma.site.aggregate({
        where: { isPublic: true },
        _avg: { bestScore: true },
      }),
      this.prisma.site.groupBy({
        by: ['tier'],
        where: { isPublic: true, tier: { not: null } },
        _count: true,
      }),
    ]);

    const tierDistribution: Record<string, number> = {};
    for (const t of tierCounts) {
      if (t.tier) tierDistribution[t.tier] = t._count;
    }

    return {
      totalSites,
      avgScore: Math.round(avgResult._avg.bestScore || 0),
      tierDistribution,
    };
  }

  async getNewcomers() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.site.findMany({
      where: {
        isPublic: true,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        tier: true,
        bestScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async togglePublic(siteId: string, dto: TogglePublicDto) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    return this.prisma.site.update({
      where: { id: siteId },
      data: {
        isPublic: dto.isPublic,
        ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
      },
      select: {
        id: true,
        isPublic: true,
        industry: true,
        tier: true,
        bestScore: true,
      },
    });
  }

  async recalculateTiers() {
    this.logger.log('Recalculating site tiers...');

    const sites = await this.prisma.site.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        bestScore: true,
        bestScoreAt: true,
        _count: { select: { crawlerVisits: true } },
      },
    });

    for (const site of sites) {
      let tier: string | null = null;
      if (site.bestScore >= 80 && site._count.crawlerVisits > 0) {
        tier = 'platinum';
      } else if (site.bestScore >= 80) {
        tier = 'gold';
      } else if (site.bestScore >= 70) {
        tier = 'silver';
      } else if (site.bestScore >= 60) {
        tier = 'bronze';
      }

      await this.prisma.site.update({
        where: { id: site.id },
        data: { tier },
      });
    }

    this.logger.log(`Recalculated tiers for ${sites.length} sites`);
  }
}
