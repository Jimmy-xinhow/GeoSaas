import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmsHostingModule } from '../llms-hosting/llms-hosting.module';
import { ContentQualityRunner } from './content-quality.runner';
import { ContentQualityController } from './content-quality.controller';
import { LongTailArticleQaService } from './long-tail-article-qa.service';

@Module({
  imports: [ConfigModule, PrismaModule, LlmsHostingModule],
  controllers: [ContentQualityController],
  providers: [ContentQualityRunner, LongTailArticleQaService],
  exports: [ContentQualityRunner, LongTailArticleQaService],
})
export class ContentQualityModule {}
