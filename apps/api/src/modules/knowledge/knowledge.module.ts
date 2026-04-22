import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { BillingModule } from '../billing/billing.module';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [BillingModule, IndexNowModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, PlanUsageService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
