import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [IndexNowModule],
  controllers: [SitesController],
  providers: [SitesService, PlanUsageService],
  exports: [SitesService],
})
export class SitesModule {}
