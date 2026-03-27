import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { NewsService } from './news.service';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(private readonly service: NewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published news articles' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('locale') locale?: string,
  ) {
    return this.service.list({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 12,
      category: category || undefined,
      locale: locale || 'zh-TW',
    });
  }

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Get latest news for homepage widget' })
  latest(@Query('limit') limit?: string) {
    return this.service.getLatest(limit ? parseInt(limit, 10) : 5);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get news article by slug' })
  getBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.service.getBySlug(slug, locale || 'zh-TW');
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a news article (admin)' })
  create(@Body() body: any) {
    return this.service.create(body);
  }
}
