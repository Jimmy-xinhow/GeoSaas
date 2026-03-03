import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MonitorService } from './monitor.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Monitor')
@ApiBearerAuth()
@Controller()
export class MonitorController {
  constructor(private monitorService: MonitorService) {}

  @Get('monitors/dashboard')
  getDashboard(@CurrentUser('userId') userId: string) {
    return this.monitorService.getDashboard(userId);
  }

  @Get('sites/:siteId/monitors')
  findBySite(@Param('siteId') siteId: string) {
    return this.monitorService.findBySite(siteId);
  }

  @Post('sites/:siteId/monitors')
  create(@Param('siteId') siteId: string, @Body() data: { platform: string; query: string }) {
    return this.monitorService.create({ siteId, ...data });
  }

  @Post('monitors/:id/check')
  checkCitation(@Param('id') id: string) {
    return this.monitorService.checkCitation(id);
  }

  @Delete('monitors/:id')
  remove(@Param('id') id: string) {
    return this.monitorService.remove(id);
  }
}
