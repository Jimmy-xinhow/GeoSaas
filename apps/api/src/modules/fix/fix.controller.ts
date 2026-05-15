import { Body, Controller, ForbiddenException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreditService } from '../billing/credit.service';
import {
  ApplyFixDto,
  GenerateFaqSchemaDto,
  GenerateJsonLdDto,
  GenerateLlmsTxtDto,
  GenerateOgTagsDto,
  SmartGenerateDto,
} from './dto';
import { FixService } from './fix.service';

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
  async smartGenerate(
    @Body() dto: SmartGenerateDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    this.fixService.assertSmartIndicatorSupported(dto.indicator);
    await this.fixService.assertSmartGenerateAccess(dto.siteId, dto.scanResultId, userId, role);
    const check = await this.credits.checkAndDeduct(userId, 1, 'Smart fix generation');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.fixService.smartGenerate(dto.siteId, dto.indicator, dto.scanResultId, userId, role);
  }

  @Patch(':scanResultId/apply')
  @ApiOperation({ summary: 'Apply generated fix code to a scan result' })
  @ApiResponse({ status: 200, description: 'Fix applied successfully' })
  applyFix(
    @Param('scanResultId') scanResultId: string,
    @Body() dto: ApplyFixDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.fixService.applyFix(scanResultId, dto.generatedCode, userId, role);
  }
}
