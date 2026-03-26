import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { ScanProcessor } from './scan.processor';
import { ScanPipelineService } from './scan-pipeline.service';
import { CrawlerService } from './crawler/crawler.service';
import { ParserService } from './crawler/parser.service';
import { ScoringService } from './scoring/scoring.service';
import { JsonLdIndicator } from './indicators/json-ld.indicator';
import { LlmsTxtIndicator } from './indicators/llms-txt.indicator';
import { OgTagsIndicator } from './indicators/og-tags.indicator';
import { MetaDescriptionIndicator } from './indicators/meta-description.indicator';
import { FaqSchemaIndicator } from './indicators/faq-schema.indicator';
import { TitleOptimizationIndicator } from './indicators/title-optimization.indicator';
import { ContactInfoIndicator } from './indicators/contact-info.indicator';
import { ImageAltIndicator } from './indicators/image-alt.indicator';

const indicatorProviders = [
  JsonLdIndicator,
  LlmsTxtIndicator,
  OgTagsIndicator,
  MetaDescriptionIndicator,
  FaqSchemaIndicator,
  TitleOptimizationIndicator,
  ContactInfoIndicator,
  ImageAltIndicator,
];

const coreProviders = [
  ScanService,
  ScanPipelineService,
  CrawlerService,
  ParserService,
  ScoringService,
  ...indicatorProviders,
];

@Module({
  imports: [BullModule.registerQueue({ name: 'scan' })],
  controllers: [ScanController],
  providers: [...coreProviders, ScanProcessor],
  exports: [ScanService, ScanPipelineService],
})
export class ScanModule {}
