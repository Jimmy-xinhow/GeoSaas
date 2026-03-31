import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsGeneratorService } from './news-generator.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsGeneratorService],
  exports: [NewsService, NewsGeneratorService],
})
export class NewsModule {}
