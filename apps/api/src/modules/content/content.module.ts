import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { AiService } from './ai/ai.service';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  controllers: [ContentController],
  providers: [ContentService, AiService, PlanUsageService],
  exports: [ContentService],
})
export class ContentModule {}
