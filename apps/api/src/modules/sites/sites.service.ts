import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowService } from '../indexnow/indexnow.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);
  private readonly webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';

  constructor(
    private prisma: PrismaService,
    private planUsage: PlanUsageService,
    private indexNow: IndexNowService,
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

    const site = await this.prisma.site.create({
      data: { ...dto, userId },
    });

    // If the new site is public, AI crawlers should learn about it fast:
    // ping the new directory page + the platform-wide feeds that list it.
    if (site.isPublic) {
      this.pingDirectoryUrls(site.id);
    }

    return site;
  }

  private pingDirectoryUrls(siteId: string): void {
    const urls = [
      `${this.webUrl}/directory/${siteId}`,
      `${this.webUrl}/llms-full.txt`,
      `${this.webUrl}/sitemap.xml`,
    ];
    for (const url of urls) {
      this.indexNow
        .submitUrl(url)
        .catch((err) => this.logger.warn(`IndexNow ping failed for ${url}: ${err}`));
    }
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
    const before = await this.findOne(id, userId, userRole);
    const after = await this.prisma.site.update({ where: { id }, data: dto });

    // Ping when a site transitions to public or when a public site's
    // identity-shaping fields (name/url/industry/description) change —
    // those affect how the directory page + llms-full.txt render.
    const becamePublic = !before.isPublic && after.isPublic;
    const publicFieldsChanged =
      after.isPublic &&
      (before.name !== after.name ||
        before.url !== after.url ||
        before.industry !== after.industry);
    if (becamePublic || publicFieldsChanged) {
      this.pingDirectoryUrls(id);
    }

    return after;
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
