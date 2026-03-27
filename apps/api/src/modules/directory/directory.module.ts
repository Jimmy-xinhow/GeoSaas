import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { DirectorySchedulerService } from './directory-scheduler.service';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [IndexNowModule],
  controllers: [DirectoryController],
  providers: [DirectoryService, DirectorySchedulerService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
