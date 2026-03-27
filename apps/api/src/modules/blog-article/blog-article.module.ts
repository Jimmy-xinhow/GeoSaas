import { Module } from '@nestjs/common';
import { BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';
import { BlogTemplateService } from './blog-template.service';

@Module({
  controllers: [BlogArticleController],
  providers: [BlogArticleService, BlogTemplateService],
  exports: [BlogArticleService],
})
export class BlogArticleModule {}
