import { Module } from '@nestjs/common';
import { FixModule } from '../fix/fix.module';
import { CmsFixController } from './cms-fix.controller';
import { CmsFixService } from './cms-fix.service';

@Module({
  imports: [FixModule],
  controllers: [CmsFixController],
  providers: [CmsFixService],
  exports: [CmsFixService],
})
export class CmsFixModule {}
