import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JsonLdGenerator } from './generators/json-ld.generator';
import { LlmsTxtGenerator } from './generators/llms-txt.generator';
import { OgTagsGenerator } from './generators/og-tags.generator';
import { FaqSchemaGenerator } from './generators/faq-schema.generator';
import { GenerateJsonLdDto } from './dto/generate-json-ld.dto';
import { GenerateLlmsTxtDto } from './dto/generate-llms-txt.dto';
import { GenerateOgTagsDto } from './dto/generate-og-tags.dto';

@Injectable()
export class FixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonLdGen: JsonLdGenerator,
    private readonly llmsTxtGen: LlmsTxtGenerator,
    private readonly ogTagsGen: OgTagsGenerator,
    private readonly faqSchemaGen: FaqSchemaGenerator,
  ) {}

  generateJsonLd(data: GenerateJsonLdDto) {
    return { code: this.jsonLdGen.generate(data), language: 'html' };
  }

  generateLlmsTxt(data: GenerateLlmsTxtDto) {
    return { code: this.llmsTxtGen.generate(data), language: 'text' };
  }

  generateOgTags(data: GenerateOgTagsDto) {
    return { code: this.ogTagsGen.generate(data), language: 'html' };
  }

  generateFaqSchema(faqs: { question: string; answer: string }[]) {
    return { code: this.faqSchemaGen.generate(faqs), language: 'html' };
  }

  /**
   * Apply a generated fix to a scan result by saving the generated code.
   * This allows the frontend to display and track which fixes have been applied.
   */
  async applyFix(scanResultId: string, generatedCode: string) {
    const scanResult = await this.prisma.scanResult.findUnique({
      where: { id: scanResultId },
    });

    if (!scanResult) {
      throw new NotFoundException(`ScanResult with id "${scanResultId}" not found`);
    }

    const updated = await this.prisma.scanResult.update({
      where: { id: scanResultId },
      data: { generatedCode },
    });

    return {
      id: updated.id,
      indicator: updated.indicator,
      generatedCode: updated.generatedCode,
      message: 'Fix applied successfully',
    };
  }
}
