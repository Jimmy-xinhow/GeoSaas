import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [SitesController],
  providers: [SitesService, PlanUsageService],
  exports: [SitesService],
})
export class SitesModule {}
