import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { ScanModule } from '../scan/scan.module';
import { BadgeModule } from '../badge/badge.module';
import { LlmsHostingModule } from '../llms-hosting/llms-hosting.module';

@Module({
  imports: [ScanModule, BadgeModule, LlmsHostingModule],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
