import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsSyncService } from './analytics-sync.service';

@ApiTags('Admin - Measurement')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/analytics')
export class AnalyticsSyncController {
  constructor(private readonly service: AnalyticsSyncService) {}

  @Get('status')
  @ApiOperation({ summary: 'Show GSC/GA4 configuration and persisted sync state' })
  status() {
    return this.service.status();
  }

  @Get('opportunities')
  @ApiOperation({ summary: 'Join page-level search demand with GA4 engagement' })
  opportunities(@Query('days') days?: string) {
    return this.service.opportunities(days ? Number(days) : 28);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Synchronize both Search Console and GA4 daily facts' })
  syncAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.syncAll(startDate, endDate);
  }

  @Post('sync/gsc')
  @ApiOperation({ summary: 'Synchronize Search Console daily facts' })
  syncGsc(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.syncSearchConsole(startDate, endDate);
  }

  @Post('sync/ga4')
  @ApiOperation({ summary: 'Synchronize GA4 landing-page daily facts' })
  syncGa4(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.syncGa4(startDate, endDate);
  }
}
