import { Module } from '@nestjs/common';
import { ScanModule } from '../scan/scan.module';
import { GuestScanController } from './guest-scan.controller';
import { GuestScanService } from './guest-scan.service';

@Module({
  imports: [ScanModule],
  controllers: [GuestScanController],
  providers: [GuestScanService],
})
export class GuestScanModule {}
