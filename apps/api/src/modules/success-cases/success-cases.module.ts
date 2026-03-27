import { Module } from '@nestjs/common';
import { SuccessCasesController } from './success-cases.controller';
import { SuccessCasesService } from './success-cases.service';

@Module({
  controllers: [SuccessCasesController],
  providers: [SuccessCasesService],
  exports: [SuccessCasesService],
})
export class SuccessCasesModule {}
