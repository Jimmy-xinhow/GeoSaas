import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { ProfileEnrichmentService } from './profile-enrichment.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { GeoGrowthPlanService } from './geo-growth-plan.service';

@Module({
  imports: [IndexNowModule],
  controllers: [SitesController],
  providers: [SitesService, PlanUsageService, ProfileEnrichmentService, GeoGrowthPlanService],
  exports: [SitesService, ProfileEnrichmentService, GeoGrowthPlanService],
})
export class SitesModule {}
