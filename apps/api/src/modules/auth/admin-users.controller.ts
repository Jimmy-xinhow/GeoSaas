import { BadRequestException, Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private prisma: PrismaService) {}

  private readonly allowedRoles = new Set(['USER', 'STAFF', 'ADMIN', 'SUPER_ADMIN']);
  private readonly allowedPlans = new Set(['FREE', 'STARTER', 'PRO']);
  private readonly grantablePlans = new Set(['STARTER', 'PRO']);

  @Get()
  @ApiOperation({ summary: 'List all users (admin)' })
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('siteFilter') siteFilter?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '20', 10);
    const skip = (p - 1) * l;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (siteFilter) {
      if (siteFilter === 'no_sites') {
        where.sites = { none: {} };
      } else if (siteFilter === 'has_sites_not_public') {
        where.AND = [
          ...(where.AND || []),
          { sites: { some: {} } },
          { sites: { none: { isPublic: true } } },
        ];
      } else if (siteFilter !== 'all') {
        throw new BadRequestException('Invalid siteFilter');
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          plan: true,
          planExpiresAt: true,
          planSource: true,
          managedBy: true,
          createdAt: true,
          planGrantsReceived: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              plan: true,
              days: true,
              startsAt: true,
              expiresAt: true,
              reason: true,
              createdAt: true,
              grantedBy: { select: { email: true, name: true } },
            },
          },
          sites: {
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              isPublic: true,
              bestScore: true,
              bestScoreAt: true,
              updatedAt: true,
            },
          },
          _count: { select: { sites: true, contents: true, orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map((user) => {
      const sites = user.sites;
      const scores = sites.map((site) => site.bestScore ?? 0);
      const latestScanTimes = sites
        .map((site) => site.bestScoreAt ?? site.updatedAt)
        .filter(Boolean)
        .map((value) => new Date(value as Date));

      return {
        ...user,
        sites: [],
        siteSummary: {
          totalSites: sites.length,
          publicSites: sites.filter((site) => site.isPublic).length,
          privateSites: sites.filter((site) => !site.isPublic).length,
          highestScore: scores.length > 0 ? Math.max(...scores) : null,
          lastScanAt:
            latestScanTimes.length > 0
              ? latestScanTimes.sort((a, b) => b.getTime() - a.getTime())[0]
              : null,
        },
      };
    });

    return { items, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  @Get(':userId/sites')
  @ApiOperation({ summary: 'List one user sites with latest scan details (admin)' })
  async listUserSites(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('User not found');

    const sites = await this.prisma.site.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        isPublic: true,
        isClient: true,
        isVerified: true,
        bestScore: true,
        bestScoreAt: true,
        tier: true,
        createdAt: true,
        updatedAt: true,
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            totalScore: true,
            status: true,
            createdAt: true,
            completedAt: true,
            results: {
              orderBy: { indicator: 'asc' },
              select: {
                indicator: true,
                score: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            scans: true,
            qas: true,
            blogArticles: true,
            monitors: true,
          },
        },
      },
    });

    return sites.map((site) => {
      const latestScan = site.scans[0] ?? null;
      return {
        id: site.id,
        name: site.name,
        url: site.url,
        industry: site.industry,
        isPublic: site.isPublic,
        isClient: site.isClient,
        isVerified: site.isVerified,
        bestScore: site.bestScore,
        bestScoreAt: site.bestScoreAt,
        tier: site.tier,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
        latestScan: latestScan
          ? {
              id: latestScan.id,
              totalScore: latestScan.totalScore,
              status: latestScan.status,
              createdAt: latestScan.createdAt,
              completedAt: latestScan.completedAt,
              results: latestScan.results,
            }
          : null,
        counts: site._count,
      };
    });
  }

  @Patch(':userId/role')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Change user role (SUPER_ADMIN only)' })
  async changeRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
  ) {
    if (!this.allowedRoles.has(role)) {
      throw new BadRequestException('Invalid role');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
      select: { id: true, email: true, role: true },
    });
  }

  @Patch(':userId/plan')
  @ApiOperation({ summary: 'Change user plan (admin)' })
  async changePlan(
    @Param('userId') userId: string,
    @Body('plan') plan: string,
  ) {
    if (!this.allowedPlans.has(plan)) {
      throw new BadRequestException('Invalid plan');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: plan as any, planExpiresAt: null, planSource: 'admin_manual' },
      select: { id: true, email: true, plan: true, planExpiresAt: true, planSource: true },
    });
  }

  @Patch(':userId/plan-grant')
  @ApiOperation({ summary: 'Grant paid plan time to a user (admin)' })
  async grantPlanTime(
    @Param('userId') userId: string,
    @Body('plan') plan: string,
    @Body('days') rawDays: number,
    @Body('reason') rawReason: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    if (!this.grantablePlans.has(plan)) {
      throw new BadRequestException('Grant plan must be STARTER or PRO');
    }

    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new BadRequestException('Grant days must be an integer between 1 and 366');
    }

    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (reason.length < 3 || reason.length > 300) {
      throw new BadRequestException('Reason must be 3-300 characters');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        plan: true,
        planExpiresAt: true,
        planSource: true,
      },
    });
    if (!target) throw new ForbiddenException('User not found');

    if (target.plan === plan && !target.planExpiresAt && target.planSource === 'paid_subscription') {
      throw new BadRequestException('User already has an active paid subscription for this plan');
    }

    const now = new Date();
    const extendFrom =
      target.plan === plan && target.planExpiresAt && target.planExpiresAt > now
        ? target.planExpiresAt
        : now;
    const expiresAt = new Date(extendFrom.getTime() + days * 24 * 60 * 60 * 1000);

    const [, user] = await this.prisma.$transaction([
      this.prisma.planGrant.create({
        data: {
          userId: target.id,
          grantedById: adminUserId,
          plan: plan as any,
          days,
          startsAt: extendFrom,
          expiresAt,
          reason,
          previousPlan: target.plan,
          previousPlanExpiresAt: target.planExpiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id: target.id },
        data: {
          plan: plan as any,
          planExpiresAt: expiresAt,
          planSource: 'manual_grant',
        },
        select: {
          id: true,
          email: true,
          plan: true,
          planExpiresAt: true,
          planSource: true,
        },
      }),
    ]);

    return { user, grantedDays: days, expiresAt };
  }

  @Delete(':userId')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete user and all related data (SUPER_ADMIN only)' })
  async deleteUser(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    if (user.role === 'SUPER_ADMIN') throw new ForbiddenException('Cannot delete SUPER_ADMIN');

    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true, email: user.email };
  }

  @Patch(':userId/password')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Reset user password (SUPER_ADMIN only)' })
  async resetPassword(
    @Param('userId') userId: string,
    @Body('password') password: string,
  ) {
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true };
  }

  @Patch(':userId/name')
  @ApiOperation({ summary: 'Update user name (admin)' })
  async updateName(
    @Param('userId') userId: string,
    @Body('name') name: string,
  ) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new BadRequestException('Name is required');
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
      select: { id: true, name: true },
    });
  }

  @Patch(':userId/managed-by')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Set user managed-by (SUPER_ADMIN only)' })
  async setManagedBy(
    @Param('userId') userId: string,
    @Body('managedBy') managedBy: string | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { managedBy },
      select: { id: true, managedBy: true },
    });
  }
}
