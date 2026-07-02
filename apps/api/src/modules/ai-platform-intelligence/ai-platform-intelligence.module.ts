import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { AiPlatformIntelligenceService } from './ai-platform-intelligence.service';

@Module({
  imports: [PrismaModule, IndexNowModule],
  providers: [AiPlatformIntelligenceService],
  exports: [AiPlatformIntelligenceService],
})
export class AiPlatformIntelligenceModule {}
