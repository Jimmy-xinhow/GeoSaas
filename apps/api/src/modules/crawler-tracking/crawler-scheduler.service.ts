import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CrawlerTrackingService } from './crawler-tracking.service';

@Injectable()
export class CrawlerSchedulerService {
  private readonly logger = new Logger(CrawlerSchedulerService.name);

  constructor(private readonly crawlerService: CrawlerTrackingService) {}

  @Cron('0 1 * * *') // Every day at 1 AM
  async handleRobotsCheck() {
    this.logger.log('Starting daily robots.txt check...');
    await this.crawlerService.checkAllRobots();
  }

  @Cron('0 3 1 * *') // 1st of each month at 3 AM
  async handleCleanup() {
    this.logger.log('Starting monthly cleanup of old crawler visits...');
    await this.crawlerService.cleanupOldVisits();
  }
}
