import { Controller, Post, Get, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { IndexNowService } from './indexnow.service';
import { Public } from '../../common/decorators/public.decorator';
import { SubmitUrlDto, SubmitBatchDto } from './dto/indexnow.dto';

@ApiTags('IndexNow')
@Controller('api')
export class IndexNowController {
  constructor(private readonly indexNowService: IndexNowService) {}

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
