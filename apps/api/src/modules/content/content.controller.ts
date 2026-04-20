import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CitationGapService } from './citation-gap.service';
import { CreditService } from '../billing/credit.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';

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
  async generate(@Body() dto: GenerateContentDto, @CurrentUser('userId') userId: string) {
    const check = await this.credits.checkAndDeduct(userId, 2, '手動生成 AI 內容（文章/FAQ）');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.contentService.generate(dto, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: { title?: string; body?: string }, @CurrentUser('userId') userId: string) {
    return this.contentService.update(id, data, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.contentService.remove(id, userId);
  }

  @Get('citation-gaps/:siteId')
  @ApiOperation({ summary: 'Analyze citation gaps for a site' })
  analyzeGaps(@Param('siteId') siteId: string) {
    return this.citationGap.analyzeGaps(siteId);
  }

  @Post('citation-gaps/:siteId/fill')
  @ApiOperation({ summary: 'Run citation gap fill for a site (generate Q&A + articles)' })
  async fillGaps(@Param('siteId') siteId: string, @CurrentUser('userId') userId: string) {
    const check = await this.credits.checkAndDeduct(userId, 2, '手動生成引用缺口內容');
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
