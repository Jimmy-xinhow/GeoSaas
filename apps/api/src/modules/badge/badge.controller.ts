import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BadgeService } from './badge.service';

@ApiTags('Badges')
@Controller('api')
export class BadgeController {
  constructor(private readonly service: BadgeService) {}

  @Public()
  @Get('sites/:siteId/badges')
  @ApiOperation({ summary: 'Get badges for a site' })
  getBadges(@Param('siteId') siteId: string) {
    return this.service.getSiteBadges(siteId);
  }

  @Public()
  @Get('badge/:siteId.svg')
  @ApiOperation({ summary: 'Get SVG badge image for a site' })
  async getSvgBadge(@Param('siteId') siteId: string, @Res() res: Response) {
    const svg = await this.service.generateSvgBadge(siteId);
    if (!svg) {
      return res.status(404).send('Site not found');
    }
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    return res.send(svg);
  }

  @ApiBearerAuth()
  @Get('badge/:siteId/embed-code')
  @ApiOperation({ summary: 'Get embed code snippets for a site badge' })
  async getEmbedCode(@Param('siteId') siteId: string) {
    const code = await this.service.getEmbedCode(siteId);
    if (!code) return { error: 'Site not found' };
    return code;
  }
}
