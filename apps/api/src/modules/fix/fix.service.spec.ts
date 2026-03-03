import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FixService } from './fix.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JsonLdGenerator } from './generators/json-ld.generator';
import { LlmsTxtGenerator } from './generators/llms-txt.generator';
import { OgTagsGenerator } from './generators/og-tags.generator';
import { FaqSchemaGenerator } from './generators/faq-schema.generator';

describe('FixService', () => {
  let service: FixService;
  let prisma: {
    scanResult: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let jsonLdGen: { generate: jest.Mock };
  let llmsTxtGen: { generate: jest.Mock };
  let ogTagsGen: { generate: jest.Mock };
  let faqSchemaGen: { generate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      scanResult: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    jsonLdGen = { generate: jest.fn() };
    llmsTxtGen = { generate: jest.fn() };
    ogTagsGen = { generate: jest.fn() };
    faqSchemaGen = { generate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FixService,
        { provide: PrismaService, useValue: prisma },
        { provide: JsonLdGenerator, useValue: jsonLdGen },
        { provide: LlmsTxtGenerator, useValue: llmsTxtGen },
        { provide: OgTagsGenerator, useValue: ogTagsGen },
        { provide: FaqSchemaGenerator, useValue: faqSchemaGen },
      ],
    }).compile();

    service = module.get<FixService>(FixService);
  });

  describe('generateJsonLd', () => {
    it('should return generated JSON-LD code with html language tag', () => {
      const mockCode = '<script type="application/ld+json">...</script>';
      jsonLdGen.generate.mockReturnValue(mockCode);

      const data = { type: 'Organization', name: 'Acme', url: 'https://acme.com' };
      const result = service.generateJsonLd(data as any);

      expect(jsonLdGen.generate).toHaveBeenCalledWith(data);
      expect(result).toEqual({ code: mockCode, language: 'html' });
    });
  });

  describe('generateLlmsTxt', () => {
    it('should return generated llms.txt content with text language tag', () => {
      const mockCode = '# Acme Corp\n> Description\nWebsite: https://acme.com';
      llmsTxtGen.generate.mockReturnValue(mockCode);

      const data = { title: 'Acme Corp', description: 'Description', url: 'https://acme.com' };
      const result = service.generateLlmsTxt(data as any);

      expect(llmsTxtGen.generate).toHaveBeenCalledWith(data);
      expect(result).toEqual({ code: mockCode, language: 'text' });
    });
  });

  describe('generateOgTags', () => {
    it('should return generated OG tags with html language tag', () => {
      const mockCode = '<meta property="og:title" content="Acme" />';
      ogTagsGen.generate.mockReturnValue(mockCode);

      const data = { title: 'Acme', description: 'Desc', url: 'https://acme.com' };
      const result = service.generateOgTags(data as any);

      expect(ogTagsGen.generate).toHaveBeenCalledWith(data);
      expect(result).toEqual({ code: mockCode, language: 'html' });
    });
  });

  describe('generateFaqSchema', () => {
    it('should return generated FAQ schema with html language tag', () => {
      const mockCode = '<script type="application/ld+json">...</script>';
      faqSchemaGen.generate.mockReturnValue(mockCode);

      const faqs = [
        { question: 'What is GEO?', answer: 'Generative Engine Optimization' },
      ];
      const result = service.generateFaqSchema(faqs);

      expect(faqSchemaGen.generate).toHaveBeenCalledWith(faqs);
      expect(result).toEqual({ code: mockCode, language: 'html' });
    });
  });

  describe('applyFix', () => {
    it('should apply a fix to an existing scan result and return success', async () => {
      const scanResultId = 'sr-1';
      const generatedCode = '<script>fixed code</script>';
      const mockScanResult = { id: scanResultId, indicator: 'JSON_LD', generatedCode: null };
      const updatedScanResult = { ...mockScanResult, generatedCode };

      prisma.scanResult.findUnique.mockResolvedValue(mockScanResult);
      prisma.scanResult.update.mockResolvedValue(updatedScanResult);

      const result = await service.applyFix(scanResultId, generatedCode);

      expect(prisma.scanResult.findUnique).toHaveBeenCalledWith({
        where: { id: scanResultId },
      });
      expect(prisma.scanResult.update).toHaveBeenCalledWith({
        where: { id: scanResultId },
        data: { generatedCode },
      });
      expect(result).toEqual({
        id: scanResultId,
        indicator: 'JSON_LD',
        generatedCode,
        message: 'Fix applied successfully',
      });
    });

    it('should throw NotFoundException when scan result does not exist', async () => {
      prisma.scanResult.findUnique.mockResolvedValue(null);

      await expect(
        service.applyFix('nonexistent', '<script>code</script>'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
