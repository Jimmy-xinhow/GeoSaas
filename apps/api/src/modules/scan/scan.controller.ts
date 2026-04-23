import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScanService } from './scan.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Scans')
@ApiBearerAuth()
@Controller()
export class ScanController {
  constructor(private scanService: ScanService) {}

  @Post('admin/scan/weekly-refresh')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary:
      'Manually trigger the weekly scan refresh. ?limit=50 default, max 200. Picks isClient sites + stale (>14d) public sites, oldest first.',
  })
  triggerWeeklyRefresh(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(200, limit ? parseInt(limit, 10) : 50));
    // Fire-and-forget — scans are ~10s each × N, would exceed HTTP timeout.
    this.scanService.runWeeklyRefresh(n).catch((err) => {
      console.error('weekly-refresh crashed:', err);
    });
    return { message: 'weekly refresh started', limit: n };
  }

  @Post('admin/scan/site/:siteId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary:
      '強制對指定 site 立即執行一次完整掃描(跳過擁有者檢查與方案配額)。用於 GEO 綜合體檢需要即時新鮮資料時。',
  })
  async adminForceScanSite(@Param('siteId') siteId: string) {
    return this.scanService.adminForceScan(siteId);
  }

  @Post('sites/:siteId/scans')
  triggerScan(@Param('siteId') siteId: string, @CurrentUser('userId') userId: string) {
    return this.scanService.triggerScan(siteId, userId);
  }

  @Get('sites/:siteId/scans')
  getScanHistory(@Param('siteId') siteId: string, @CurrentUser('userId') userId: string) {
    return this.scanService.getScanHistory(siteId, userId);
  }

  @Get('scans/trend')
  getScoreTrend(@CurrentUser('userId') userId: string) {
    return this.scanService.getScoreTrend(userId);
  }

  @Get('scans/:scanId')
  getScan(@Param('scanId') scanId: string) {
    return this.scanService.getScanById(scanId);
  }

  @Get('scans/:scanId/results')
  getScanResults(@Param('scanId') scanId: string) {
    return this.scanService.getScanResults(scanId);
  }
}
