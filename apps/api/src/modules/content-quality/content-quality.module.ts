import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContentQualityRunner } from './content-quality.runner';
import { ContentQualityController } from './content-quality.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ContentQualityController],
  providers: [ContentQualityRunner],
  exports: [ContentQualityRunner],
})
export class ContentQualityModule {}
