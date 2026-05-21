import { Module } from '@nestjs/common';
import { FixModule } from '../fix/fix.module';
import { GuidedFixController } from './guided-fix.controller';
import { GuidedFixService } from './guided-fix.service';

@Module({
  imports: [FixModule],
  controllers: [GuidedFixController],
  providers: [GuidedFixService],
})
export class GuidedFixModule {}
