import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContentQualityRunner } from './content-quality.runner';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [ContentQualityRunner],
  exports: [ContentQualityRunner],
})
export class ContentQualityModule {}
