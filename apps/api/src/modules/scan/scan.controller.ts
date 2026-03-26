import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScanService } from './scan.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Scans')
@ApiBearerAuth()
@Controller()
export class ScanController {
  constructor(private scanService: ScanService) {}

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
