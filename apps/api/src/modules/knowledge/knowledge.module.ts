import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, PlanUsageService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
