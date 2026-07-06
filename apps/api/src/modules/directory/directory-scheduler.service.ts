import { Injectable, Logger } from '@nestjs/common';
import { DirectoryService } from './directory.service';

@Injectable()
export class DirectorySchedulerService {
  private readonly logger = new Logger(DirectorySchedulerService.name);

  constructor(private readonly directoryService: DirectoryService) {}

  // 由 CronManager 排程（task-registry 的 'tier_recalculation'），勿再加 @Cron 以免雙跑。
  async handleTierRecalculation() {
    this.logger.log('Running daily tier recalculation...');
    await this.directoryService.recalculateTiers();
  }
}
