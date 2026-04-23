import { Module } from '@nestjs/common';
import { CrawlerTrackingController } from './crawler-tracking.controller';
import { CrawlerTrackingService } from './crawler-tracking.service';
import { RobotsParserService } from './robots-parser.service';
import { SnippetGeneratorService } from './snippet-generator.service';
import { CrawlerSchedulerService } from './crawler-scheduler.service';
import { PerplexityPingService } from './perplexity-ping.service';
import { CrawlerBoostService } from './crawler-boost.service';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [IndexNowModule],
  controllers: [CrawlerTrackingController],
  providers: [
    CrawlerTrackingService,
    RobotsParserService,
    SnippetGeneratorService,
    CrawlerSchedulerService,
    PerplexityPingService,
    CrawlerBoostService,
  ],
  exports: [CrawlerTrackingService, PerplexityPingService, CrawlerBoostService],
})
export class CrawlerTrackingModule {}
