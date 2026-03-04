import { Module } from '@nestjs/common';
import { LlmsHostingController } from './llms-hosting.controller';
import { LlmsHostingService } from './llms-hosting.service';
import { FixModule } from '../fix/fix.module';

@Module({
  imports: [FixModule],
  controllers: [LlmsHostingController],
  providers: [LlmsHostingService],
})
export class LlmsHostingModule {}
