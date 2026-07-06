import { Module } from '@nestjs/common';
import { BadgeController } from './badge.controller';
import { BadgeService } from './badge.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BadgeController],
  providers: [BadgeService],
  exports: [BadgeService],
})
export class BadgeModule {}
