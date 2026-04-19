import { Module } from '@nestjs/common';
import { SuccessCasesController } from './success-cases.controller';
import { SuccessCasesService } from './success-cases.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SuccessCasesController],
  providers: [SuccessCasesService],
  exports: [SuccessCasesService],
})
export class SuccessCasesModule {}
