import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Plan Limits Configuration ───
export const PLAN_LIMITS = {
  FREE: {
    maxSites: 1,
    scansPerSitePerMonth: 2,
    fixesPerMonth: 1,        // 1 free trial
    contentPerMonth: 0,
    knowledgePerMonth: 0,
    monitorPerMonth: 0,
    reportsPerMonth: 0,
    multiPlatform: false,
    autoSchedule: false,
  },
  STARTER: {
    maxSites: 1,
    scansPerSitePerMonth: 6,
    fixesPerMonth: 30,
    contentPerMonth: 30,
    knowledgePerMonth: 10,
    monitorPerMonth: 20,
    reportsPerMonth: 2,
    multiPlatform: false,
    autoSchedule: false,
  },
  PRO: {
    maxSites: 3,
    scansPerSitePerMonth: 10,
    fixesPerMonth: 50,
    contentPerMonth: 50,
    knowledgePerMonth: 15,
    monitorPerMonth: 30,
    reportsPerMonth: 3,
    multiPlatform: true,
    autoSchedule: true,
  },
} as const;

export type PlanLimitKey = keyof typeof PLAN_LIMITS.FREE;

// ─── Decorator ───
export const PLAN_FEATURE_KEY = 'plan_feature';
export const RequirePlan = (feature: PlanLimitKey, minValue: number = 1) =>
  (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(PLAN_FEATURE_KEY, { feature, minValue }, descriptor?.value ?? target);
    return descriptor ?? target;
  };

// ─── Guard ───
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<{ feature: PlanLimitKey; minValue: number }>(
      PLAN_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // STAFF and SUPER_ADMIN bypass plan limits
    if (user.role === 'STAFF' || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return true;
    }

    const plan = user.plan || 'FREE';
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    if (!limits) return false;

    const limitValue = limits[requirement.feature];

    // Boolean features
    if (typeof limitValue === 'boolean') {
      if (!limitValue) {
        throw new ForbiddenException(
          `此功能需要升級方案才能使用。目前方案：${plan}`,
        );
      }
      return true;
    }

    // Numeric features — check if value meets minimum
    if (typeof limitValue === 'number' && limitValue < requirement.minValue) {
      throw new ForbiddenException(
        `此功能需要升級方案才能使用。目前方案：${plan}`,
      );
    }

    return true;
  }
}

// ─── Usage Tracking Service ───
@Injectable()
export class PlanUsageService {
  constructor(private prisma: PrismaService) {}

  private getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async checkAndIncrement(
    userId: string,
    feature: PlanLimitKey,
    userPlan: string,
    userRole: string,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    // STAFF/ADMIN bypass
    if (['STAFF', 'SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      return { allowed: true, used: 0, limit: -1 };
    }

    const plan = userPlan || 'FREE';
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    if (!limits) return { allowed: false, used: 0, limit: 0 };

    const limit = limits[feature];
    if (typeof limit === 'boolean') {
      return { allowed: limit, used: 0, limit: limit ? -1 : 0 };
    }

    if (limit === 0) {
      return { allowed: false, used: 0, limit: 0 };
    }

    const monthStart = this.getMonthStart();
    let used = 0;

    switch (feature) {
      case 'fixesPerMonth':
        used = await this.prisma.scan.count({
          where: {
            site: { userId },
            createdAt: { gte: monthStart },
            status: 'COMPLETED',
          },
        });
        // Use scan count as proxy for fix usage (will be refined later)
        break;

      case 'contentPerMonth':
        used = await this.prisma.content.count({
          where: { userId, createdAt: { gte: monthStart } },
        });
        break;

      case 'knowledgePerMonth':
        // Count knowledge generation actions this month
        used = await this.prisma.siteQa.count({
          where: {
            site: { userId },
            createdAt: { gte: monthStart },
          },
        }) > 0 ? Math.ceil(
          await this.prisma.siteQa.count({
            where: { site: { userId }, createdAt: { gte: monthStart } },
          }) / 60
        ) : 0; // Each batch generates ~60 QAs
        break;

      case 'monitorPerMonth':
        used = await this.prisma.monitor.count({
          where: { site: { userId }, checkedAt: { gte: monthStart } },
        });
        break;

      case 'reportsPerMonth':
        used = await this.prisma.monitorReport.count({
          where: { site: { userId }, createdAt: { gte: monthStart } },
        });
        break;

      case 'scansPerSitePerMonth':
        // This is per-site, handled differently in scan service
        break;

      case 'maxSites':
        used = await this.prisma.site.count({ where: { userId } });
        break;

      default:
        break;
    }

    return {
      allowed: (limit as number) === -1 || used < (limit as number),
      used,
      limit: limit as number,
    };
  }

  async getUsageSummary(userId: string, userPlan: string) {
    const monthStart = this.getMonthStart();
    const limits = PLAN_LIMITS[(userPlan || 'FREE') as keyof typeof PLAN_LIMITS];

    const [sitesCount, scansCount, contentCount, monitorCount, reportsCount, qaCount] =
      await Promise.all([
        this.prisma.site.count({ where: { userId } }),
        this.prisma.scan.count({
          where: { site: { userId }, createdAt: { gte: monthStart } },
        }),
        this.prisma.content.count({
          where: { userId, createdAt: { gte: monthStart } },
        }),
        this.prisma.monitor.count({
          where: { site: { userId }, checkedAt: { gte: monthStart } },
        }),
        this.prisma.monitorReport.count({
          where: { site: { userId }, createdAt: { gte: monthStart } },
        }),
        this.prisma.siteQa.count({
          where: { site: { userId }, createdAt: { gte: monthStart } },
        }),
      ]);

    return {
      plan: userPlan,
      sites: { used: sitesCount, limit: limits.maxSites },
      scans: { used: scansCount, limit: limits.scansPerSitePerMonth * limits.maxSites },
      content: { used: contentCount, limit: limits.contentPerMonth },
      monitor: { used: monitorCount, limit: limits.monitorPerMonth },
      reports: { used: reportsCount, limit: limits.reportsPerMonth },
      knowledge: { used: Math.ceil(qaCount / 60), limit: limits.knowledgePerMonth },
      multiPlatform: limits.multiPlatform,
      autoSchedule: limits.autoSchedule,
    };
  }
}
