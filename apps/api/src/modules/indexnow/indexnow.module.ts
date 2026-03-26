import { Module } from '@nestjs/common';
import { IndexNowController } from './indexnow.controller';
import { IndexNowService } from './indexnow.service';

@Module({
  controllers: [IndexNowController],
  providers: [IndexNowService],
  exports: [IndexNowService],
})
export class IndexNowModule {}
