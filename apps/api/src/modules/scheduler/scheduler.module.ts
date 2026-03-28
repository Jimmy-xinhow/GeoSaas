import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { CronManagerService } from './cron-manager.service';
import { TaskRegistryService } from './task-registry.service';
import { MonitorModule } from '../monitor/monitor.module';
import { DirectoryModule } from '../directory/directory.module';
import { BlogArticleModule } from '../blog-article/blog-article.module';
import { SeedModule } from '../seed/seed.module';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { ScanModule } from '../scan/scan.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [MonitorModule, DirectoryModule, BlogArticleModule, SeedModule, IndexNowModule, ScanModule, DiscoveryModule, PrismaModule],
  controllers: [SchedulerController],
  providers: [CronManagerService, TaskRegistryService],
  exports: [CronManagerService],
})
export class SchedulerModule {}
