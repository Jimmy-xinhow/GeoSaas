import { Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (admin)' })
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
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

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          plan: true,
          managedBy: true,
          createdAt: true,
          _count: { select: { sites: true, contents: true, orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  @Patch(':userId/role')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Change user role (SUPER_ADMIN only)' })
  async changeRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
  ) {
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
    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: plan as any },
      select: { id: true, email: true, plan: true },
    });
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
}
