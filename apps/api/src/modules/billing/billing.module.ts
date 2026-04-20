import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CreditService } from './credit.service';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, CreditService, PlanUsageService],
  exports: [CreditService],
})
export class BillingModule {}
