import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BrandSpreadService } from './brand-spread.service';
import { CreditService } from '../billing/credit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Brand Spread')
@ApiBearerAuth()
@Controller('brand-spread')
export class BrandSpreadController {
  private readonly allowedPlatforms = new Set([
    'medium',
    'vocus',
    'linkedin',
    'facebook',
    'google_business',
    'ptt',
  ]);

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
    @CurrentUser('role') role?: string,
  ) {
    await this.assertCanUseSite(siteId, userId, role);
    const platformList = this.parsePlatforms(platforms) ?? [
      'medium',
      'vocus',
      'linkedin',
      'facebook',
      'google_business',
      'ptt',
    ];

    if (userId) {
      const totalPoints = platformList.length * 2; // 2 points per platform
      const check = await this.credits.checkAndDeduct(
        userId,
        totalPoints,
        `Generate brand spread content (${platformList.length} platforms, ${totalPoints} credits)`,
      );
      if (!check.allowed) throw new ForbiddenException(check.message);
    }

    return this.service.generateAll(siteId, platformList);
  }

  @Post('weekly-plan/:siteId')
  @ApiOperation({ summary: 'Generate weekly content plan for a site' })
  async weeklyPlan(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    await this.assertCanUseSite(siteId, userId, role);

    if (userId) {
      const check = await this.credits.checkAndDeduct(
        userId,
        2,
        'Generate weekly brand spread plan',
      );
      if (!check.allowed) throw new ForbiddenException(check.message);
    }

    return this.service.generateWeeklyPlan(siteId);
  }

  private parsePlatforms(platforms?: string): string[] | undefined {
    if (!platforms) return undefined;
    const parsed = platforms
      .split(',')
      .map((platform) => platform.trim())
      .filter(Boolean);
    if (parsed.length === 0) {
      throw new BadRequestException('At least one platform is required');
    }

    const invalid = parsed.filter(
      (platform) => !this.allowedPlatforms.has(platform),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid platform: ${invalid.join(', ')}`);
    }

    return [...new Set(parsed)];
  }

  private async assertCanUseSite(
    siteId: string,
    userId?: string,
    role?: string,
  ) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return;
    if (!userId || site.userId !== userId) {
      throw new ForbiddenException('You do not have access to this site');
    }
  }
}
