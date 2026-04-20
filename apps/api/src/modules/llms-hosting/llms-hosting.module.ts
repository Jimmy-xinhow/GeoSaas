import { Module } from '@nestjs/common';
import { LlmsHostingController } from './llms-hosting.controller';
import { LlmsHostingService } from './llms-hosting.service';
import { FixModule } from '../fix/fix.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [FixModule, BillingModule],
  controllers: [LlmsHostingController],
  providers: [LlmsHostingService],
  exports: [LlmsHostingService],
})
export class LlmsHostingModule {}
