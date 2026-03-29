import { Module } from '@nestjs/common';
import { ClientReportController } from './client-report.controller';
import { ClientReportService } from './client-report.service';
import { MonitorModule } from '../monitor/monitor.module';

@Module({
  imports: [MonitorModule],
  controllers: [ClientReportController],
  providers: [ClientReportService],
  exports: [ClientReportService],
})
export class ClientReportModule {}
