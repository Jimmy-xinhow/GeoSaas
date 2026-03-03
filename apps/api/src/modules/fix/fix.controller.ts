import { Controller, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FixService } from './fix.service';
import {
  GenerateJsonLdDto,
  GenerateOgTagsDto,
  GenerateLlmsTxtDto,
  GenerateFaqSchemaDto,
  ApplyFixDto,
} from './dto';

@ApiTags('Fix')
@ApiBearerAuth()
@Controller('fix')
export class FixController {
  constructor(private fixService: FixService) {}

  @Post('json-ld/generate')
  @ApiOperation({ summary: 'Generate JSON-LD structured data' })
  @ApiResponse({ status: 201, description: 'Returns generated JSON-LD HTML snippet' })
  generateJsonLd(@Body() dto: GenerateJsonLdDto) {
    return this.fixService.generateJsonLd(dto);
  }

  @Post('llms-txt/generate')
  @ApiOperation({ summary: 'Generate llms.txt file content' })
  @ApiResponse({ status: 201, description: 'Returns generated llms.txt content' })
  generateLlmsTxt(@Body() dto: GenerateLlmsTxtDto) {
    return this.fixService.generateLlmsTxt(dto);
  }

  @Post('og-tags/generate')
  @ApiOperation({ summary: 'Generate Open Graph meta tags' })
  @ApiResponse({ status: 201, description: 'Returns generated OG tags HTML snippet' })
  generateOgTags(@Body() dto: GenerateOgTagsDto) {
    return this.fixService.generateOgTags(dto);
  }

  @Post('faq-schema/generate')
  @ApiOperation({ summary: 'Generate FAQ structured data schema' })
  @ApiResponse({ status: 201, description: 'Returns generated FAQ schema HTML snippet' })
  generateFaqSchema(@Body() dto: GenerateFaqSchemaDto) {
    return this.fixService.generateFaqSchema(dto.faqs);
  }

  @Patch(':scanResultId/apply')
  @ApiOperation({ summary: 'Apply generated fix code to a scan result' })
  @ApiResponse({ status: 200, description: 'The scan result with the applied fix' })
  @ApiResponse({ status: 404, description: 'Scan result not found' })
  applyFix(
    @Param('scanResultId') scanResultId: string,
    @Body() dto: ApplyFixDto,
  ) {
    return this.fixService.applyFix(scanResultId, dto.generatedCode);
  }
}
