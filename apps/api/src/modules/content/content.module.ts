import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { AiService } from './ai/ai.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService, AiService],
  exports: [ContentService],
})
export class ContentModule {}
