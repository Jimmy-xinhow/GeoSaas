import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MonitorService } from './monitor.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateMonitorDto } from './dto/create-monitor.dto';

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
  findBySite(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.monitorService.findBySite(siteId, userId, role);
  }

  @Post('sites/:siteId/monitors')
  create(
    @Param('siteId') siteId: string,
    @Body() data: CreateMonitorDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.monitorService.create({ siteId, ...data }, userId, role);
  }

  @Post('monitors/:id/check')
  checkCitation(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.monitorService.checkCitation(id, userId, role);
  }

  @Delete('monitors/:id')
  remove(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.monitorService.remove(id, userId, role);
  }
}
