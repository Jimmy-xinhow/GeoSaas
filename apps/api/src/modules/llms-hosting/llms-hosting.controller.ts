import { Controller, Get, Put, Post, Param, Body, Res, Header } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { LlmsHostingService } from './llms-hosting.service';
import { UpdateLlmsTxtDto } from './dto/update-llms-txt.dto';

@ApiTags('llms-hosting')
@Controller()
export class LlmsHostingController {
  constructor(private readonly service: LlmsHostingService) {}

  @Public()
  @Get('llms/:siteId/llms.txt')
  @ApiOperation({ summary: 'Get hosted llms.txt (public, plain text)' })
  @ApiResponse({ status: 200, description: 'Returns llms.txt content as plain text' })
  async getPublicLlmsTxt(
    @Param('siteId') siteId: string,
    @Res() res: Response,
  ) {
    const content = await this.service.getLlmsTxt(siteId);
    if (!content) {
      return res.status(404).type('text/plain').send('# llms.txt not configured');
    }
    res.set('Cache-Control', 'public, max-age=3600');
    return res.type('text/plain').send(content);
  }

  @ApiBearerAuth()
  @Get('sites/:siteId/llms-txt')
  @ApiOperation({ summary: 'Get llms.txt content for editing' })
  async getLlmsTxt(@Param('siteId') siteId: string) {
    const content = await this.service.getLlmsTxt(siteId);
    return { content: content || '' };
  }

  @ApiBearerAuth()
  @Put('sites/:siteId/llms-txt')
  @ApiOperation({ summary: 'Update llms.txt content' })
  async updateLlmsTxt(
    @Param('siteId') siteId: string,
    @Body() dto: UpdateLlmsTxtDto,
  ) {
    return this.service.updateLlmsTxt(siteId, dto.content);
  }

  @ApiBearerAuth()
  @Post('sites/:siteId/llms-txt/generate')
  @ApiOperation({ summary: 'AI generate llms.txt content' })
  async generateLlmsTxt(@Param('siteId') siteId: string) {
    return this.service.generateLlmsTxt(siteId);
  }
}
