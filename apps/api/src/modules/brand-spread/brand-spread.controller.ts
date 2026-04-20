import { Controller, Get, Post, Param, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BrandSpreadService } from './brand-spread.service';
import { CreditService } from '../billing/credit.service';
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
    private readonly credits: CreditService,
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
    if (userId) {
      const platformList = platforms ? platforms.split(',') : ['medium', 'vocus', 'linkedin', 'facebook', 'google_business', 'ptt'];
      const totalPoints = platformList.length * 2; // 2 points per platform
      const check = await this.credits.checkAndDeduct(userId, totalPoints, `品牌擴散內容生成（${platformList.length} 平台，${totalPoints} 點）`);
      if (!check.allowed) throw new ForbiddenException(check.message);
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
      const check = await this.credits.checkAndDeduct(userId, 2, '生成週內容計畫');
      if (!check.allowed) throw new ForbiddenException(check.message);
    }
    return this.service.generateWeeklyPlan(siteId);
  }
}
