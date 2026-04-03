import { Controller, Get, Post, Param, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BrandSpreadService } from './brand-spread.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Brand Spread')
@ApiBearerAuth()
@Controller('brand-spread')
export class BrandSpreadController {
  constructor(
    private readonly service: BrandSpreadService,
    private readonly planUsage: PlanUsageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('platforms')
  @ApiOperation({ summary: 'Get available platforms for content generation' })
  getPlatforms() {
    return this.service.getPlatforms();
  }

  @Post('generate/:siteId')
  @ApiOperation({ summary: 'Generate spread content for all platforms' })
  async generateAll(
    @Param('siteId') siteId: string,
    @Query('platforms') platforms?: string,
    @CurrentUser('userId') userId?: string,
  ) {
    // Check plan — counts as content generation (6 calls = 6 content uses)
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const check = await this.planUsage.checkAndIncrement(userId, 'contentPerMonth', user.plan, user.role);
        if (!check.allowed) {
          throw new ForbiddenException(`已達本月內容生成額度上限（${check.used}/${check.limit}）。請升級方案以繼續使用。`);
        }
      }
    }
    const platformList = platforms ? platforms.split(',') : undefined;
    return this.service.generateAll(siteId, platformList);
  }

  @Post('weekly-plan/:siteId')
  @ApiOperation({ summary: 'Generate weekly content plan for a site' })
  async weeklyPlan(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId?: string,
  ) {
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const check = await this.planUsage.checkAndIncrement(userId, 'contentPerMonth', user.plan, user.role);
        if (!check.allowed) {
          throw new ForbiddenException(`已達本月內容生成額度上限（${check.used}/${check.limit}）。請升級方案以繼續使用。`);
        }
      }
    }
    return this.service.generateWeeklyPlan(siteId);
  }
}
