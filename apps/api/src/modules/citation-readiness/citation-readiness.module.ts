import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CitationJudgeService } from './citation-judge.service';
import { CitationReadinessService } from './citation-readiness.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [CitationJudgeService, CitationReadinessService],
  exports: [CitationReadinessService],
})
export class CitationReadinessModule {}
