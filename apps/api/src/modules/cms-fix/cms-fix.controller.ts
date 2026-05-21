import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CmsFixService } from './cms-fix.service';
import { ConnectWordPressDto, PluginActionResultDto, PluginPingDto } from './dto/cms-fix.dto';

@ApiTags('CMS Fix')
@Controller('cms-fix')
export class CmsFixController {
  constructor(private readonly service: CmsFixService) {}

  @ApiBearerAuth()
  @Post('sites/:siteId/wordpress/connect')
  @ApiOperation({ summary: 'Create or rotate a WordPress auto-fix plugin token' })
  connectWordPress(
    @Param('siteId') siteId: string,
    @Body() dto: ConnectWordPressDto,
    @Headers('origin') origin: string | undefined,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.connectWordPress(siteId, userId, role, dto, origin);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/status')
  @ApiOperation({ summary: 'Get CMS auto-fix connection and latest run status' })
  getStatus(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getStatus(siteId, userId, role);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/plan')
  @ApiOperation({ summary: 'Create a CMS repair plan from the latest scan' })
  createPlan(
    @Param('siteId') siteId: string,
    @Headers('origin') origin: string | undefined,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.createPlan(siteId, userId, role, origin);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/runs/:runId/dispatch')
  @ApiOperation({ summary: 'Dispatch a CMS repair plan to the connected plugin' })
  dispatchRun(
    @Param('siteId') siteId: string,
    @Param('runId') runId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.dispatchRun(siteId, runId, userId, role);
  }

  @Public()
  @Post('plugin/:siteId/ping')
  @ApiOperation({ summary: 'WordPress plugin heartbeat' })
  pluginPing(
    @Param('siteId') siteId: string,
    @Headers('x-geovault-token') token: string | undefined,
    @Body() dto: PluginPingDto,
  ) {
    return this.service.pluginPing(siteId, token, dto);
  }

  @Public()
  @Get('plugin/:siteId/manifest')
  @ApiOperation({ summary: 'WordPress plugin pulls dispatched fix actions' })
  getPluginManifest(
    @Param('siteId') siteId: string,
    @Headers('x-geovault-token') token: string | undefined,
  ) {
    return this.service.getPluginManifest(siteId, token);
  }

  @Public()
  @Post('plugin/:siteId/actions/:actionId/result')
  @ApiOperation({ summary: 'WordPress plugin reports a fix action result' })
  reportActionResult(
    @Param('siteId') siteId: string,
    @Param('actionId') actionId: string,
    @Headers('x-geovault-token') token: string | undefined,
    @Body() dto: PluginActionResultDto,
  ) {
    return this.service.reportActionResult(siteId, actionId, token, dto);
  }
}
