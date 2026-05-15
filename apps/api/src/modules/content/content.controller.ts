import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { CreditService } from '../billing/credit.service';
import { CitationGapService } from './citation-gap.service';
import { ContentService } from './content.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@ApiTags('Content')
@ApiBearerAuth()
@Controller('contents')
export class ContentController {
  constructor(
    private contentService: ContentService,
    private citationGap: CitationGapService,
    private credits: CreditService,
  ) {}

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.contentService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.contentService.findOne(id, userId);
  }

  @Post('generate')
  async generate(
    @Body() dto: GenerateContentDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const balance = await this.credits.getBalance(userId);
    const hasAvailableQuota =
      role === 'STAFF' ||
      role === 'ADMIN' ||
      role === 'SUPER_ADMIN' ||
      (balance?.freeGenerations.remaining ?? 0) > 0 ||
      (balance?.credits ?? 0) >= 2;
    if (!hasAvailableQuota) throw new ForbiddenException('點數不足');

    this.contentService.assertAiConfigured();
    const check = await this.credits.checkAndDeduct(userId, 2, 'AI content generation');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.contentService.generate(dto, userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdateContentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.contentService.update(id, data, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.contentService.remove(id, userId);
  }

  @Get('citation-gaps/:siteId')
  @ApiOperation({ summary: 'Analyze citation gaps for a site' })
  async analyzeGaps(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.citationGap.assertSiteAccess(siteId, userId, role);
    return this.citationGap.analyzeGaps(siteId);
  }

  @Post('citation-gaps/:siteId/fill')
  @ApiOperation({ summary: 'Run citation gap fill for a site (generate Q&A + articles)' })
  async fillGaps(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.citationGap.assertSiteAccess(siteId, userId, role);
    const check = await this.credits.checkAndDeduct(userId, 2, 'citation gap fill');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.citationGap.runForSite(siteId);
  }

  @Post('admin/citation-gaps/run-all')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Run citation gap fill for all priority sites' })
  async runAllGaps() {
    this.citationGap.scheduledGapFill().catch(() => {});
    return { message: 'Citation gap fill started for all priority sites' };
  }
}
