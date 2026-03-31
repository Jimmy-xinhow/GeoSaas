import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PlanUsageService],
})
export class BillingModule {}
