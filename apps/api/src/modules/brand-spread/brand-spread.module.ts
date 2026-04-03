import { Module } from '@nestjs/common';
import { BrandSpreadController } from './brand-spread.controller';
import { BrandSpreadService } from './brand-spread.service';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [BrandSpreadController],
  providers: [BrandSpreadService, PlanUsageService],
  exports: [BrandSpreadService],
})
export class BrandSpreadModule {}
