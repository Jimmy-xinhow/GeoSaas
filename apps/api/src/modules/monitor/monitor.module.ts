import { Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorSchedulerService } from './monitor-scheduler.service';
import { ChatgptDetector } from './platforms/chatgpt.detector';
import { ClaudeDetector } from './platforms/claude.detector';
import { PerplexityDetector } from './platforms/perplexity.detector';
import { GeminiDetector } from './platforms/gemini.detector';
import { CopilotDetector } from './platforms/copilot.detector';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MonitorController],
  providers: [MonitorService, MonitorSchedulerService, ChatgptDetector, ClaudeDetector, PerplexityDetector, GeminiDetector, CopilotDetector],
  exports: [MonitorService, MonitorSchedulerService, ChatgptDetector, ClaudeDetector, PerplexityDetector, GeminiDetector, CopilotDetector],
})
export class MonitorModule {}
