import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BrandSpreadService } from './brand-spread.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Brand Spread')
@ApiBearerAuth()
@Controller('brand-spread')
export class BrandSpreadController {
  constructor(private readonly service: BrandSpreadService) {}

  @Get('platforms')
  @ApiOperation({ summary: 'Get available platforms for content generation' })
  getPlatforms() {
    return this.service.getPlatforms();
  }

  @Post('generate/:siteId')
  @ApiOperation({ summary: 'Generate spread content for all platforms' })
  generateAll(
    @Param('siteId') siteId: string,
    @Query('platforms') platforms?: string,
  ) {
    const platformList = platforms ? platforms.split(',') : undefined;
    return this.service.generateAll(siteId, platformList);
  }
}
