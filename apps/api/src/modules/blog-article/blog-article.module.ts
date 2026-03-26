import { Module } from '@nestjs/common';
import { BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';

@Module({
  controllers: [BlogArticleController],
  providers: [BlogArticleService],
  exports: [BlogArticleService],
})
export class BlogArticleModule {}
