import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { DirectorySchedulerService } from './directory-scheduler.service';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { LlmsHostingModule } from '../llms-hosting/llms-hosting.module';
import { SitesModule } from '../sites/sites.module';
import { BlogArticleModule } from '../blog-article/blog-article.module';

@Module({
  imports: [IndexNowModule, LlmsHostingModule, SitesModule, BlogArticleModule],
  controllers: [DirectoryController],
  providers: [DirectoryService, DirectorySchedulerService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
