import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { CronManagerService } from './cron-manager.service';
import { TaskRegistryService } from './task-registry.service';
import { MonitorModule } from '../monitor/monitor.module';
import { DirectoryModule } from '../directory/directory.module';
import { BlogArticleModule } from '../blog-article/blog-article.module';

@Module({
  imports: [MonitorModule, DirectoryModule, BlogArticleModule],
  controllers: [SchedulerController],
  providers: [CronManagerService, TaskRegistryService],
  exports: [CronManagerService],
})
export class SchedulerModule {}
