import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PublishService } from './publish.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Publish')
@ApiBearerAuth()
@Controller()
export class PublishController {
  constructor(private publishService: PublishService) {}

  @Post('contents/:contentId/publish')
  publish(@Param('contentId') contentId: string, @Body('platforms') platforms: string[], @CurrentUser('userId') userId: string) {
    return this.publishService.publish(contentId, platforms, userId);
  }

  @Get('publications')
  findAll(@CurrentUser('userId') userId: string) {
    return this.publishService.findAll(userId);
  }
}
