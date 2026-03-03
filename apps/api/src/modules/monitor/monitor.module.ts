import { Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { ChatgptDetector } from './platforms/chatgpt.detector';
import { ClaudeDetector } from './platforms/claude.detector';
import { PerplexityDetector } from './platforms/perplexity.detector';
import { GeminiDetector } from './platforms/gemini.detector';

@Module({
  controllers: [MonitorController],
  providers: [MonitorService, ChatgptDetector, ClaudeDetector, PerplexityDetector, GeminiDetector],
})
export class MonitorModule {}
