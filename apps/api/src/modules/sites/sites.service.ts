import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(
    private prisma: PrismaService,
    private planUsage: PlanUsageService,
  ) {}

  async create(dto: CreateSiteDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const check = await this.planUsage.checkAndIncrement(userId, 'maxSites', user.plan, user.role);
    if (!check.allowed) {
      throw new ForbiddenException(
        `已達網站數量上限（${check.used}/${check.limit}）。請升級方案以新增更多網站。`,
      );
    }

    return this.prisma.site.create({
      data: { ...dto, userId },
    });
  }

  /**
   * findAll — respects role-based data isolation:
   * - USER: own sites only
   * - STAFF: only isClient=true sites (managed by their SUPER_ADMIN)
   * - ADMIN/SUPER_ADMIN: own sites
   */
  async findAll(userId: string, userRole?: string) {
    let where: any = { userId };

    if (userRole === 'STAFF') {
      // STAFF sees only client-tagged sites
      where = { isClient: true };
    }

    return this.prisma.site.findMany({
      where,
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true, status: true, createdAt: true } },
        _count: { select: { scans: true, monitors: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, userRole?: string) {
    let where: any = { id, userId };

    if (userRole === 'STAFF') {
      where = { id, isClient: true };
    } else if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      where = { id }; // Admin can access any site
    }

    const site = await this.prisma.site.findFirst({
      where,
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { scans: true, monitors: true, competitors: true } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async update(id: string, dto: UpdateSiteDto, userId: string, userRole?: string) {
    await this.findOne(id, userId, userRole);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string, userRole?: string) {
    await this.findOne(id, userId, userRole);
    return this.prisma.site.delete({ where: { id } });
  }

  // ─── Client Tagging (SUPER_ADMIN only) ───

  async toggleClient(siteId: string, isClient: boolean) {
    return this.prisma.site.update({
      where: { id: siteId },
      data: { isClient },
    });
  }

  async getClientSites() {
    return this.prisma.site.findMany({
      where: { isClient: true },
      include: {
        user: { select: { id: true, email: true, name: true } },
        scans: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true, status: true, createdAt: true } },
        _count: { select: { scans: true, qas: true, monitors: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async setUserManagedBy(userId: string, managedBy: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { managedBy },
    });
  }
}
