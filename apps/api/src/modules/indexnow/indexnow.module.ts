import { Module } from '@nestjs/common';
import { IndexNowController } from './indexnow.controller';
import { IndexNowService } from './indexnow.service';
import { SearchEnginePushService } from './search-engine-push.service';

@Module({
  controllers: [IndexNowController],
  providers: [IndexNowService, SearchEnginePushService],
  exports: [IndexNowService, SearchEnginePushService],
})
export class IndexNowModule {}
