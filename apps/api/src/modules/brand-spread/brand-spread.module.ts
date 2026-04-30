import { Module } from '@nestjs/common';
import { BrandSpreadController } from './brand-spread.controller';
import { BrandSpreadService } from './brand-spread.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { BillingModule } from '../billing/billing.module';
import { ContentQualityModule } from '../content-quality/content-quality.module';

@Module({
  imports: [BillingModule, ContentQualityModule],
  controllers: [BrandSpreadController],
  providers: [BrandSpreadService, PlanUsageService],
  exports: [BrandSpreadService],
})
export class BrandSpreadModule {}
