import { Module } from '@nestjs/common';
import { BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';
import { BlogTemplateService } from './blog-template.service';
import { IndustryInsightService } from './industry-insight.service';

@Module({
  controllers: [BlogArticleController],
  providers: [BlogArticleService, BlogTemplateService, IndustryInsightService],
  exports: [BlogArticleService, IndustryInsightService],
})
export class BlogArticleModule {}
