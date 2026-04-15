import { Controller, Post, Get, Body, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { IndexNowService } from './indexnow.service';
import { SearchEnginePushService } from './search-engine-push.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { SubmitUrlDto, SubmitBatchDto } from './dto/indexnow.dto';

@ApiTags('IndexNow')
@Controller()
export class IndexNowController {
  constructor(
    private readonly indexNowService: IndexNowService,
    private readonly searchEnginePush: SearchEnginePushService,
  ) {}

  @Public()
  @Post('indexnow/submit')
  @ApiOperation({ summary: 'Submit a URL to IndexNow engines' })
  async submitUrl(@Body() dto: SubmitUrlDto) {
    const results = await this.indexNowService.submitUrl(dto.url);
    return { success: true, data: { url: dto.url, results } };
  }

  @Post('indexnow/submit-batch')
  @ApiOperation({ summary: 'Submit multiple URLs to IndexNow engines (authenticated)' })
  async submitBatch(@Body() dto: SubmitBatchDto) {
    const host = new URL(dto.urls[0]).host;
    const results = await this.indexNowService.submitBatch(dto.urls, host);
    return { success: true, data: { count: dto.urls.length, results } };
  }

  @ApiBearerAuth()
  @Post('admin/search-engine-push')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Manually push recent URLs to Google/Bing/IndexNow' })
  async manualPush() {
    return this.searchEnginePush.manualPush();
  }

  @Public()
  @Get(':key.txt')
  @ApiOperation({ summary: 'IndexNow API key verification file' })
  verifyKey(@Param('key') key: string, @Res() res: Response) {
    const apiKey = this.indexNowService.getApiKey();
    if (key === apiKey) {
      res.type('text/plain').send(apiKey);
    } else {
      res.status(404).send('Not found');
    }
  }
}
