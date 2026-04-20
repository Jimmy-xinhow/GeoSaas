import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { CitationGapService } from './citation-gap.service';
import { AiService } from './ai/ai.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [IndexNowModule, BillingModule],
  controllers: [ContentController],
  providers: [ContentService, CitationGapService, AiService, PlanUsageService],
  exports: [ContentService, CitationGapService],
})
export class ContentModule {}
