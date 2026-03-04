import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
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

  @ApiBearerAuth()
  @Patch('sites/:siteId/directory')
  @ApiOperation({ summary: 'Toggle public directory listing + set industry' })
  togglePublic(
    @Param('siteId') siteId: string,
    @Body() dto: TogglePublicDto,
  ) {
    return this.service.togglePublic(siteId, dto);
  }
}
