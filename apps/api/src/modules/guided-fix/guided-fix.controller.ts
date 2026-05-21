import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuidedFixService } from './guided-fix.service';

@ApiTags('Guided Fix')
@ApiBearerAuth()
@Controller('guided-fix')
export class GuidedFixController {
  constructor(private readonly service: GuidedFixService) {}

  @Get('sites/:siteId/plan')
  @ApiOperation({ summary: 'Beginner-friendly fastest improvement plan for a site' })
  getPlan(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getPlan(siteId, userId, role);
  }

  @Get('sites/:siteId/handoff-package')
  @ApiOperation({ summary: 'Engineer handoff package with installable GEO files' })
  getEngineerHandoff(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getEngineerHandoff(siteId, userId, role);
  }

  @Get('sites/:siteId/completion-report')
  @ApiOperation({ summary: 'Post-fix verification report comparing latest scans' })
  getCompletionReport(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getCompletionReport(siteId, userId, role);
  }
}
