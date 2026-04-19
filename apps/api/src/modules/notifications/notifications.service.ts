import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async create(userId: string, type: string, title: string, message: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, message },
    });

    // Send email notification (non-blocking)
    this.sendEmailForNotification(userId, type, title, message).catch((err) => {
      this.logger.warn(`Email for notification failed: ${err}`);
    });

    return notification;
  }

  private async sendEmailForNotification(userId: string, type: string, title: string, message: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) return;

    switch (type) {
      case 'scan_complete':
        await this.email.sendScanComplete(user.email, {
          siteName: title.replace('掃描完成 — ', ''),
          score: parseInt(message.match(/(\d+)\/100/)?.[1] || '0'),
          url: '',
        });
        break;

      case 'badge_earned':
        await this.email.sendBadgeEarned(user.email, {
          siteName: title,
          badgeLabel: message,
        });
        break;

      case 'monitor_change':
        await this.email.sendMonitorChange(user.email, { changes: message });
        break;

      case 'welcome':
        await this.email.sendWelcome(user.email, user.name || '使用者');
        break;

      default:
        // Other notification types: in-app only, no email
        break;
    }
  }
}
