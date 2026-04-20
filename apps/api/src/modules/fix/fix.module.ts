import { Module } from '@nestjs/common';
import { FixController } from './fix.controller';
import { FixService } from './fix.service';
import { JsonLdGenerator } from './generators/json-ld.generator';
import { LlmsTxtGenerator } from './generators/llms-txt.generator';
import { OgTagsGenerator } from './generators/og-tags.generator';
import { FaqSchemaGenerator } from './generators/faq-schema.generator';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { BillingModule } from '../billing/billing.module';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  imports: [KnowledgeModule, BillingModule],
  controllers: [FixController],
  providers: [FixService, JsonLdGenerator, LlmsTxtGenerator, OgTagsGenerator, FaqSchemaGenerator, PlanUsageService],
  exports: [FixService],
})
export class FixModule {}
