import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import {
  CreateSiteCmsArticleDto,
  SiteCmsArticlePreviewDto,
  SiteCmsArticleQueryDto,
  SiteCmsArticleVersionDto,
  SiteCmsChangePasswordDto,
  SiteCmsLoginDto,
  UpdateSiteCmsArticleDto,
} from './dto';
import { CurrentSiteCms } from './current-site-cms.decorator';
import { SiteCmsAuthGuard } from './site-cms-auth.guard';
import { SiteCmsService } from './site-cms.service';
import { SiteCmsContext } from './site-cms.types';
import { UploadService } from '../upload/upload.service';

@Public()
@Controller('site-cms/sites/:siteId')
export class SiteCmsController {
  constructor(
    private readonly service: SiteCmsService,
    private readonly uploadService: UploadService,
  ) {}

  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Param('siteId') siteId: string, @Body() dto: SiteCmsLoginDto) {
    return this.service.login(siteId, dto);
  }

  @Get('auth/me')
  @UseGuards(SiteCmsAuthGuard)
  me(@CurrentSiteCms() current: SiteCmsContext) {
    return this.service.me(current);
  }

  @Post('auth/logout')
  @UseGuards(SiteCmsAuthGuard)
  logout(@CurrentSiteCms() current: SiteCmsContext) {
    return this.service.logout(current);
  }

  @Post('auth/change-password')
  @UseGuards(SiteCmsAuthGuard)
  changePassword(@CurrentSiteCms() current: SiteCmsContext, @Body() dto: SiteCmsChangePasswordDto) {
    return this.service.changePassword(current, dto);
  }

  @Get('public/export')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async publicExport(@Param('siteId') siteId: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Content-Version', new Date().toISOString());
    return this.service.publicExport(siteId);
  }

  @Get('articles')
  @UseGuards(SiteCmsAuthGuard)
  listArticles(@CurrentSiteCms() current: SiteCmsContext, @Query() query: SiteCmsArticleQueryDto) {
    return this.service.listArticles(current, query);
  }

  @Post('articles')
  @UseGuards(SiteCmsAuthGuard)
  createArticle(@CurrentSiteCms() current: SiteCmsContext, @Body() dto: CreateSiteCmsArticleDto) {
    return this.service.createArticle(current, dto);
  }

  @Post('articles/preview')
  @UseGuards(SiteCmsAuthGuard)
  previewArticle(@CurrentSiteCms() current: SiteCmsContext, @Body() dto: SiteCmsArticlePreviewDto) {
    return this.service.previewArticle(current, dto);
  }

  @Get('articles/:articleId')
  @UseGuards(SiteCmsAuthGuard)
  findArticle(@CurrentSiteCms() current: SiteCmsContext, @Param('articleId') articleId: string) {
    return this.service.findArticle(current, articleId);
  }

  @Patch('articles/:articleId')
  @UseGuards(SiteCmsAuthGuard)
  updateArticle(
    @CurrentSiteCms() current: SiteCmsContext,
    @Param('articleId') articleId: string,
    @Body() dto: UpdateSiteCmsArticleDto,
  ) {
    return this.service.updateArticle(current, articleId, dto);
  }

  @Post('articles/:articleId/publish')
  @UseGuards(SiteCmsAuthGuard)
  publishArticle(
    @CurrentSiteCms() current: SiteCmsContext,
    @Param('articleId') articleId: string,
    @Body() dto: SiteCmsArticleVersionDto,
  ) {
    return this.service.publishArticle(current, articleId, dto.version);
  }

  @Post('articles/:articleId/unpublish')
  @UseGuards(SiteCmsAuthGuard)
  unpublishArticle(
    @CurrentSiteCms() current: SiteCmsContext,
    @Param('articleId') articleId: string,
    @Body() dto: SiteCmsArticleVersionDto,
  ) {
    return this.service.unpublishArticle(current, articleId, dto.version);
  }

  @Delete('articles/:articleId')
  @UseGuards(SiteCmsAuthGuard)
  deleteArticle(@CurrentSiteCms() current: SiteCmsContext, @Param('articleId') articleId: string) {
    return this.service.deleteArticle(current, articleId);
  }

  @Post('media')
  @UseGuards(SiteCmsAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadMedia(@CurrentSiteCms() current: SiteCmsContext, @UploadedFile() file: any) {
    this.service.assertReady(current);
    return this.uploadService.uploadSiteCmsImage({
      siteId: current.siteId,
      accountId: current.accountId,
      file,
    });
  }
}
