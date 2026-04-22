import { Module } from '@nestjs/common';
import { BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';
import { BlogTemplateService } from './blog-template.service';
import { IndustryInsightService } from './industry-insight.service';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [IndexNowModule, SitesModule],
  controllers: [BlogArticleController],
  providers: [BlogArticleService, BlogTemplateService, IndustryInsightService],
  exports: [BlogArticleService, IndustryInsightService],
})
export class BlogArticleModule {}
