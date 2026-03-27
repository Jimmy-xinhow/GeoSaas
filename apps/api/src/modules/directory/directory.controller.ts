import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { DirectoryService } from './directory.service';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { TogglePublicDto } from './dto/toggle-public.dto';

@ApiTags('Directory')
@Controller()
export class DirectoryController {
  constructor(private readonly service: DirectoryService) {}

  @Public()
  @Get('directory')
  @ApiOperation({ summary: 'List public directory (paginated)' })
  list(@Query() query: QueryDirectoryDto) {
    return this.service.listDirectory(query);
  }

  @Public()
  @Get('directory/leaderboard')
  @ApiOperation({ summary: 'Get top 10 sites' })
  leaderboard() {
    return this.service.getLeaderboard();
  }

  @Public()
  @Get('directory/stats')
  @ApiOperation({ summary: 'Get directory statistics' })
  stats() {
    return this.service.getStats();
  }

  @Public()
  @Get('directory/newcomers')
  @ApiOperation({ summary: 'Get recent newcomers (last 30 days)' })
  newcomers() {
    return this.service.getNewcomers();
  }

  @Public()
  @Get('directory/industry-stats')
  @ApiOperation({ summary: 'Get stats per industry (overview)' })
  allIndustryStats() {
    return this.service.getAllIndustryStats();
  }

  @Public()
  @Get('directory/industry/:industry')
  @ApiOperation({ summary: 'Get stats for a specific industry' })
  industryStats(@Param('industry') industry: string) {
    return this.service.getIndustryStats(industry);
  }

  @Public()
  @Get('directory/industry/:industry/wiki')
  @ApiOperation({ summary: 'Get full wiki data for an industry' })
  industryWiki(@Param('industry') industry: string) {
    return this.service.getIndustryWikiData(industry);
  }

  @Public()
  @Get('directory/platform-stats')
  @ApiOperation({ summary: 'Get platform-wide statistics for landing page' })
  platformStats() {
    return this.service.getPlatformStats();
  }

  @Public()
  @Get('directory/today-hottest')
  @ApiOperation({ summary: 'Top 10 sites by AI crawler visits today' })
  todayHottest() {
    return this.service.getTodayHottest();
  }

  @Public()
  @Get('directory/most-crawled')
  @ApiOperation({ summary: 'Top 10 most crawled sites (all time)' })
  mostCrawled() {
    return this.service.getMostCrawled();
  }

  @Public()
  @Get('directory/recently-active')
  @ApiOperation({ summary: 'Recently active sites (last 7 days)' })
  recentlyActive() {
    return this.service.getRecentlyActive();
  }

  @Public()
  @Get('directory/progress-stars')
  @ApiOperation({ summary: 'Get top sites with biggest score improvement' })
  progressStars() {
    return this.service.getProgressStars();
  }

  @Public()
  @Get('directory/crawler-feed')
  @ApiOperation({ summary: 'Get real-time AI crawler activity feed for public sites' })
  crawlerFeed(@Query('limit') limit?: string) {
    return this.service.getCrawlerFeed(limit ? parseInt(limit, 10) : 20);
  }

  @Public()
  @Get('directory/:siteId')
  @ApiOperation({ summary: 'Get public site detail for directory' })
  detail(@Param('siteId') siteId: string) {
    return this.service.getSiteDetail(siteId);
  }

  @ApiBearerAuth()
  @Patch('sites/:siteId/directory')
  @ApiOperation({ summary: 'Toggle public directory listing + set industry' })
  togglePublic(
    @Param('siteId') siteId: string,
    @Body() dto: TogglePublicDto,
  ) {
    return this.service.togglePublic(siteId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/sites/:siteId/verify')
  @ApiOperation({ summary: 'Toggle verified status (admin)' })
  async verify(
    @Param('siteId') siteId: string,
    @Body() body: { isVerified: boolean },
  ) {
    return this.service.setVerified(siteId, body.isVerified);
  }
}
