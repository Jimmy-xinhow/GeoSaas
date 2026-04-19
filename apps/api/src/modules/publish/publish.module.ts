import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { MediumAdapter } from './adapters/medium.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { WordPressAdapter } from './adapters/wordpress.adapter';
import { VocusAdapter } from './adapters/vocus.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { GoogleBusinessAdapter } from './adapters/google-business.adapter';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [PublishController],
  providers: [
    PublishService,
    MediumAdapter,
    LinkedInAdapter,
    WordPressAdapter,
    VocusAdapter,
    FacebookAdapter,
    GoogleBusinessAdapter,
    PlanUsageService,
  ],
  exports: [PublishService],
})
export class PublishModule {}
