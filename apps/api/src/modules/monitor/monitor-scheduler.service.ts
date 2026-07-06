import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorService } from './monitor.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-types';

@Injectable()
export class MonitorSchedulerService {
  private readonly logger = new Logger(MonitorSchedulerService.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private monitorService: MonitorService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 每天凌晨 3:00 執行 — 檢查 Pro/Enterprise 用戶的所有 Monitor
   * 由 CronManager 排程（task-registry 的 'monitor_daily_pro'），勿再加 @Cron 以免雙跑。
   */
  async handleDailyProCheck() {
    await this.runScheduledChecks(['PRO'], 'daily');
  }

  /**
   * 每週一凌晨 4:00 執行 — 檢查 Free/Starter 用戶的所有 Monitor
   * 由 CronManager 排程（task-registry 的 'monitor_weekly_free'），勿再加 @Cron 以免雙跑。
   */
  async handleWeeklyFreeCheck() {
    await this.runScheduledChecks(['FREE', 'STARTER'], 'weekly');
  }

  private async runScheduledChecks(plans: string[], frequency: string) {
    if (this.isRunning) {
      this.logger.warn(`Skipping ${frequency} check — previous run still in progress`);
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting ${frequency} monitor check for plans: ${plans.join(', ')}`);

    try {
      // 找出符合方案的用戶的所有 Monitor
      const monitors = await this.prisma.monitor.findMany({
        where: {
          site: {
            user: {
              plan: { in: plans as any },
            },
          },
        },
        include: {
          site: {
            include: { user: true },
          },
        },
      });

      this.logger.log(`Found ${monitors.length} monitors to check`);

      let successCount = 0;
      let failCount = 0;
      const changedMonitors: { userId: string; query: string; platform: string; wasMentioned: boolean; nowMentioned: boolean }[] = [];

      for (const monitor of monitors) {
        try {
          const previousMentioned = monitor.mentioned;
          const updated = await this.monitorService.checkCitation(monitor.id);

          if (updated.mentioned !== previousMentioned) {
            changedMonitors.push({
              userId: monitor.site.userId,
              query: monitor.query,
              platform: monitor.platform,
              wasMentioned: previousMentioned,
              nowMentioned: updated.mentioned,
            });
          }

          successCount++;
        } catch (error) {
          failCount++;
          this.logger.error(`Failed to check monitor ${monitor.id}: ${error}`);
        }

        // Rate limiting: 等待 2 秒避免 API 過載
        await this.sleep(2000);
      }

      // 發送引用變動通知
      await this.sendChangeNotifications(changedMonitors);

      this.logger.log(
        `${frequency} check completed: ${successCount} success, ${failCount} failed, ${changedMonitors.length} changes detected`,
      );
    } catch (error) {
      this.logger.error(`${frequency} scheduled check failed: ${error}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async sendChangeNotifications(
    changes: { userId: string; query: string; platform: string; wasMentioned: boolean; nowMentioned: boolean }[],
  ) {
    // 按用戶分組
    const byUser = new Map<string, typeof changes>();
    for (const change of changes) {
      const existing = byUser.get(change.userId) || [];
      existing.push(change);
      byUser.set(change.userId, existing);
    }

    for (const [userId, userChanges] of byUser) {
      const gained = userChanges.filter((c: any) => c.nowMentioned && !c.wasMentioned);
      const lost = userChanges.filter((c: any) => !c.nowMentioned && c.wasMentioned);

      const parts: string[] = [];
      if (gained.length > 0) {
        parts.push(`新增 ${gained.length} 個 AI 引用：${gained.map((c: any) => `${c.platform} — "${c.query}"`).join('、')}`);
      }
      if (lost.length > 0) {
        parts.push(`失去 ${lost.length} 個 AI 引用：${lost.map((c: any) => `${c.platform} — "${c.query}"`).join('、')}`);
      }

      if (parts.length > 0) {
        await this.notificationsService.create(
          userId,
          NotificationType.MONITOR_CHANGE,
          'AI 引用變動通知',
          parts.join('\n'),
        );
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
