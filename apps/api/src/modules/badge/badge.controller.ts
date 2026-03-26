import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BadgeService } from './badge.service';

@ApiTags('Badges')
@Controller('api')
export class BadgeController {
  constructor(private readonly service: BadgeService) {}

  @Public()
  @Get('sites/:siteId/badges')
  @ApiOperation({ summary: 'Get badges for a site' })
  getBadges(@Param('siteId') siteId: string) {
    return this.service.getSiteBadges(siteId);
  }
}
