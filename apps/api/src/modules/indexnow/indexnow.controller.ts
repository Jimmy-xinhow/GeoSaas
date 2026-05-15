import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  UseGuards,
  Next,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NextFunction, Response } from 'express';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('indexnow/submit')
  @ApiOperation({ summary: 'Submit a URL to IndexNow engines' })
  async submitUrl(@Body() dto: SubmitUrlDto) {
    this.assertAllowedUrl(dto.url);
    const results = await this.indexNowService.submitUrl(dto.url);
    return { success: true, data: { url: dto.url, results } };
  }

  @Post('indexnow/submit-batch')
  @ApiOperation({ summary: 'Submit multiple URLs to IndexNow engines (authenticated)' })
  async submitBatch(@Body() dto: SubmitBatchDto) {
    const host = this.assertAllowedBatch(dto.urls);
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
  verifyKey(@Param('key') key: string, @Res() res: Response, @Next() next: NextFunction) {
    if (key === 'llms' || key === 'llms-full') {
      return next();
    }

    const apiKey = this.indexNowService.getApiKey();
    if (key === apiKey) {
      res.type('text/plain').send(apiKey);
    } else {
      res.status(404).send('Not found');
    }
  }

  private assertAllowedUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTP(S) URLs can be submitted');
    }

    const host = parsed.host.toLowerCase();
    if (!this.getAllowedHosts().has(host)) {
      throw new BadRequestException('URL host is not allowed for IndexNow submission');
    }
    return host;
  }

  private assertAllowedBatch(urls: string[]): string {
    const hosts = urls.map((url) => this.assertAllowedUrl(url));
    const uniqueHosts = [...new Set(hosts)];
    if (uniqueHosts.length !== 1) {
      throw new BadRequestException('All URLs in a batch must share the same host');
    }
    return uniqueHosts[0];
  }

  private getAllowedHosts(): Set<string> {
    const hosts = new Set([
      'geovault.app',
      'www.geovault.app',
      'geosaas.com',
      'www.geosaas.com',
    ]);

    const addHost = (value?: string) => {
      if (!value) return;
      for (const raw of value.split(',')) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        try {
          const parsed = trimmed.includes('://')
            ? new URL(trimmed)
            : new URL(`https://${trimmed}`);
          hosts.add(parsed.host.toLowerCase());
        } catch {
          // Ignore malformed configuration entries.
        }
      }
    };

    addHost(this.config.get<string>('INDEXNOW_ALLOWED_HOSTS'));
    addHost(this.config.get<string>('WEB_URL'));
    addHost(this.config.get<string>('FRONTEND_URL'));
    addHost(this.config.get<string>('API_PUBLIC_URL'));

    return hosts;
  }
}
