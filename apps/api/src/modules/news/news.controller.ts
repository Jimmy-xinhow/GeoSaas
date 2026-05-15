import { BadRequestException, Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { NewsService } from './news.service';
import { NewsGeneratorService } from './news-generator.service';
import { CreateNewsDto } from './dto/create-news.dto';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(
    private readonly service: NewsService,
    private readonly generator: NewsGeneratorService,
  ) {}

  private readonly allowedLocales = new Set(['zh-TW', 'en', 'ja']);

  private parsePositiveInt(value: string | undefined, fallback: number, max: number, name: string): number {
    if (!value) return fallback;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`${name} must be a positive integer`);
    }
    const parsed = Number(value);
    if (parsed < 1) throw new BadRequestException(`${name} must be at least 1`);
    if (parsed > max) throw new BadRequestException(`${name} must be at most ${max}`);
    return parsed;
  }

  private normalizeLocale(locale?: string): string {
    if (!locale) return 'zh-TW';
    const normalized = locale.trim();
    if (!this.allowedLocales.has(normalized)) {
      throw new BadRequestException('Invalid locale');
    }
    return normalized;
  }

  private normalizeCategory(category?: string): string | undefined {
    const normalized = category?.trim();
    if (!normalized) return undefined;
    if (normalized.length > 80) {
      throw new BadRequestException('category must be at most 80 characters');
    }
    return normalized;
  }

  private normalizeSlug(slug: string): string {
    const normalized = slug?.trim();
    if (!normalized) throw new BadRequestException('slug is required');
    if (normalized.length > 220) throw new BadRequestException('slug must be at most 220 characters');
    return normalized;
  }

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
      page: this.parsePositiveInt(page, 1, 10000, 'page'),
      limit: this.parsePositiveInt(limit, 12, 50, 'limit'),
      category: this.normalizeCategory(category),
      locale: this.normalizeLocale(locale),
    });
  }

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Get latest news for homepage widget' })
  latest(@Query('limit') limit?: string) {
    return this.service.getLatest(this.parsePositiveInt(limit, 5, 20, 'limit'));
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get news article by slug' })
  getBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.service.getBySlug(this.normalizeSlug(slug), this.normalizeLocale(locale));
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create a news article (admin)' })
  create(@Body() body: CreateNewsDto) {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('generate')
  @ApiOperation({ summary: 'Trigger AI news generation batch (admin)' })
  generate(@Query('count') count?: string) {
    return this.generator.generateBatch(this.parsePositiveInt(count, 10, 20, 'count'));
  }
}
