import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { MediumAdapter } from './adapters/medium.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { WordPressAdapter } from './adapters/wordpress.adapter';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [PublishController],
  providers: [PublishService, MediumAdapter, LinkedInAdapter, WordPressAdapter, PlanUsageService],
})
export class PublishModule {}
