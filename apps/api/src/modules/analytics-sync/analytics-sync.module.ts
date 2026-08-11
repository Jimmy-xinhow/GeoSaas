import { Module } from '@nestjs/common';
import { AnalyticsSyncController } from './analytics-sync.controller';
import { AnalyticsSyncService } from './analytics-sync.service';

@Module({
  controllers: [AnalyticsSyncController],
  providers: [AnalyticsSyncService],
  exports: [AnalyticsSyncService],
})
export class AnalyticsSyncModule {}
