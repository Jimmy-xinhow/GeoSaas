import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreditService } from '../billing/credit.service';
import { GenerateOfficialArticleDto, VerifyOfficialArticleDto } from './dto';
import { OfficialSiteContentService } from './official-site-content.service';

@ApiTags('Official Site Content')
@ApiBearerAuth()
@Controller('sites/:siteId/official-articles')
export class OfficialSiteContentController {
  constructor(
    private readonly service: OfficialSiteContentService,
    private readonly credits: CreditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List first-party official-site articles for a site' })
  list(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.list(siteId, userId, role);
  }

  @Get('sources')
  @ApiOperation({ summary: 'List platform article metadata available as topic inspiration' })
  sources(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.listSources(siteId, userId, role);
  }

  @Get('recommendation')
  @ApiOperation({ summary: 'Recommend a first-party topic, publish location, and slug' })
  recommendation(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.recommend(siteId, userId, role);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate a distinct first-party official-site article' })
  async generate(
    @Param('siteId') siteId: string,
    @Body() dto: GenerateOfficialArticleDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const check = await this.credits.checkAndDeduct(userId, 2, 'official-site article generation');
    this.credits.assertAllowed(check);
    try {
      return await this.service.generate(siteId, dto, userId, role);
    } catch (error) {
      await this.credits.refundDeduction(userId, 2, check, 'official-site article generation failed refund');
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one official-site article draft or approved article' })
  findOne(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findOne(id, siteId, userId, role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an official-site article that failed quality checks' })
  remove(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.remove(id, siteId, userId, role);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve an article after quality and duplicate checks' })
  approve(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.approve(id, siteId, userId, role);
  }

  @Get(':id/publish-package')
  @ApiOperation({ summary: 'Get the approved first-party article package for CMS entry' })
  publishPackage(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.getPublishPackage(id, siteId, userId, role);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Crawl the customer URL and verify publication signals' })
  verify(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: VerifyOfficialArticleDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.verify(id, siteId, dto, userId, role);
  }
}
