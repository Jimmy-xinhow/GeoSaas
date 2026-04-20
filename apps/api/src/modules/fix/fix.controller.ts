import { Controller, Post, Patch, Body, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FixService } from './fix.service';
import { CreditService } from '../billing/credit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  GenerateJsonLdDto,
  GenerateOgTagsDto,
  GenerateLlmsTxtDto,
  GenerateFaqSchemaDto,
  ApplyFixDto,
  SmartGenerateDto,
} from './dto';

@ApiTags('Fix')
@ApiBearerAuth()
@Controller('fix')
export class FixController {
  constructor(
    private fixService: FixService,
    private credits: CreditService,
  ) {}

  @Post('json-ld/generate')
  @ApiOperation({ summary: 'Generate JSON-LD structured data' })
  generateJsonLd(@Body() dto: GenerateJsonLdDto) {
    return this.fixService.generateJsonLd(dto);
  }

  @Post('llms-txt/generate')
  @ApiOperation({ summary: 'Generate llms.txt file content' })
  generateLlmsTxt(@Body() dto: GenerateLlmsTxtDto) {
    return this.fixService.generateLlmsTxt(dto);
  }

  @Post('og-tags/generate')
  @ApiOperation({ summary: 'Generate Open Graph meta tags' })
  generateOgTags(@Body() dto: GenerateOgTagsDto) {
    return this.fixService.generateOgTags(dto);
  }

  @Post('faq-schema/generate')
  @ApiOperation({ summary: 'Generate FAQ structured data schema' })
  generateFaqSchema(@Body() dto: GenerateFaqSchemaDto) {
    return this.fixService.generateFaqSchema(dto.faqs);
  }

  @Post('smart-generate')
  @ApiOperation({ summary: 'AI-powered smart fix generation based on actual website content' })
  async smartGenerate(@Body() dto: SmartGenerateDto, @CurrentUser('userId') userId: string) {
    const check = await this.credits.checkAndDeduct(userId, 1, '智能修復程式碼生成');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.fixService.smartGenerate(dto.siteId, dto.indicator, dto.scanResultId);
  }

  @Patch(':scanResultId/apply')
  @ApiOperation({ summary: 'Apply generated fix code to a scan result' })
  applyFix(
    @Param('scanResultId') scanResultId: string,
    @Body() dto: ApplyFixDto,
  ) {
    return this.fixService.applyFix(scanResultId, dto.generatedCode);
  }
}
