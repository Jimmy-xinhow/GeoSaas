import { Module } from '@nestjs/common';
import { MonitorModule } from '../monitor/monitor.module';
import { IndustryAiController } from './industry-ai.controller';
import { IndustryAiService } from './industry-ai.service';
import { IndustryAiSchedulerService } from './industry-ai-scheduler.service';

@Module({
  imports: [MonitorModule],
  controllers: [IndustryAiController],
  providers: [IndustryAiService, IndustryAiSchedulerService],
  exports: [IndustryAiService],
})
export class IndustryAiModule {}
