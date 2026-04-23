import { Module } from '@nestjs/common';
import { ClientReportController } from './client-report.controller';
import { ClientReportService } from './client-report.service';
import { MonitorModule } from '../monitor/monitor.module';
import { PlanUsageService } from '../../common/guards/plan.guard';

@Module({
  imports: [MonitorModule],
  controllers: [ClientReportController],
  providers: [ClientReportService, PlanUsageService],
  exports: [ClientReportService],
})
export class ClientReportModule {}
