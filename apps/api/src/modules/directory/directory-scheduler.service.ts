import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DirectoryService } from './directory.service';

@Injectable()
export class DirectorySchedulerService {
  private readonly logger = new Logger(DirectorySchedulerService.name);

  constructor(private readonly directoryService: DirectoryService) {}

  @Cron('0 2 * * *') // Every day at 2 AM
  async handleTierRecalculation() {
    this.logger.log('Running daily tier recalculation...');
    await this.directoryService.recalculateTiers();
  }
}
