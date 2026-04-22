import { Module } from '@nestjs/common';
import { LlmsHostingController } from './llms-hosting.controller';
import { LlmsHostingService } from './llms-hosting.service';
import { FixModule } from '../fix/fix.module';
import { BillingModule } from '../billing/billing.module';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [FixModule, BillingModule, IndexNowModule],
  controllers: [LlmsHostingController],
  providers: [LlmsHostingService],
  exports: [LlmsHostingService],
})
export class LlmsHostingModule {}
