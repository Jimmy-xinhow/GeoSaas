import { Module } from '@nestjs/common';
import { CrawlerTrackingController } from './crawler-tracking.controller';
import { CrawlerTrackingService } from './crawler-tracking.service';
import { RobotsParserService } from './robots-parser.service';
import { SnippetGeneratorService } from './snippet-generator.service';
import { CrawlerSchedulerService } from './crawler-scheduler.service';

@Module({
  controllers: [CrawlerTrackingController],
  providers: [
    CrawlerTrackingService,
    RobotsParserService,
    SnippetGeneratorService,
    CrawlerSchedulerService,
  ],
  exports: [CrawlerTrackingService],
})
export class CrawlerTrackingModule {}
