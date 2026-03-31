import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsGeneratorService } from './news-generator.service';
import { IndexNowModule } from '../indexnow/indexnow.module';

@Module({
  imports: [IndexNowModule],
  controllers: [NewsController],
  providers: [NewsService, NewsGeneratorService],
  exports: [NewsService, NewsGeneratorService],
})
export class NewsModule {}
