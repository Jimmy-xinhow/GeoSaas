import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const PLAN_MONTHLY_INCLUDED_CREDITS: Record<string, number> = {
  FREE: 0,
  STARTER: 30,
  PRO: 80,
};

export interface CreditCheckResult {
  allowed: boolean;
  source: 'free' | 'credits' | 'denied';
  freeRemaining?: number;
  creditsRemaining?: number;
  message?: string;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user can generate, and deduct accordingly.
   * Priority: included monthly plan credits -> purchased credits -> denied.
   */
  async checkAndDeduct(
    userId: string,
    points: number,
    description: string,
  ): Promise<CreditCheckResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plan: true,
        role: true,
        credits: true,
        freeGenUsed: true,
        freeGenResetAt: true,
      },
    });

    if (!user) throw new ForbiddenException('User not found');

    if (['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return { allowed: true, source: 'free' };
    }

    await this.resetMonthlyIfNeeded(userId, user);

    const freshUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, freeGenUsed: true, plan: true },
    });
    if (!freshUser) throw new ForbiddenException('User not found');

    const includedCredits = PLAN_MONTHLY_INCLUDED_CREDITS[freshUser.plan] ?? 0;
    if (includedCredits > 0 && freshUser.freeGenUsed + points <= includedCredits) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { freeGenUsed: { increment: points } },
      });

      return {
        allowed: true,
        source: 'free',
        freeRemaining: includedCredits - freshUser.freeGenUsed - points,
        creditsRemaining: freshUser.credits,
      };
    }

    if (freshUser.credits >= points) {
      await this.expireCredits(userId);

      const afterExpire = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if ((afterExpire?.credits || 0) < points) {
        return {
          allowed: false,
          source: 'denied',
          creditsRemaining: afterExpire?.credits || 0,
          message: `點數不足（需要 ${points} 點，剩餘 ${afterExpire?.credits || 0} 點）。部分點數可能已過期，請先購買點數或升級方案。`,
        };
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: points } },
      });

      const newBalance = (afterExpire?.credits || 0) - points;
      await this.prisma.creditTransaction.create({
        data: {
          userId,
          type: 'deduct',
          amount: -points,
          balance: newBalance,
          description,
        },
      });

      this.logger.log(
        `Credit deducted: ${userId} -${points} (${description}), balance: ${newBalance}`,
      );

      return {
        allowed: true,
        source: 'credits',
        creditsRemaining: newBalance,
      };
    }

    const freeMsg =
      includedCredits > 0
        ? `本月方案贈送點數已用完（${includedCredits}/${includedCredits}）`
        : '免費方案不含 AI 生成點數';

    return {
      allowed: false,
      source: 'denied',
      freeRemaining: 0,
      creditsRemaining: freshUser.credits,
      message: `${freeMsg}，點數不足（需要 ${points} 點，剩餘 ${freshUser.credits} 點）。請先購買點數或升級方案。`,
    };
  }

  assertAllowed(check: CreditCheckResult): asserts check is CreditCheckResult & { allowed: true } {
    if (check.allowed) return;
    throw new HttpException(
      {
        code: 'INSUFFICIENT_CREDITS',
        message: check.message || 'AI 生成點數不足，請先購買點數或升級方案。',
        freeRemaining: check.freeRemaining ?? 0,
        creditsRemaining: check.creditsRemaining ?? 0,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async refundDeduction(
    userId: string,
    points: number,
    deduction: CreditCheckResult,
    description: string,
  ): Promise<void> {
    if (!deduction.allowed || deduction.source === 'denied') return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, credits: true, freeGenUsed: true },
    });
    if (!user) return;

    if (['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) return;

    if (deduction.source === 'free') {
      await this.prisma.user.updateMany({
        where: { id: userId },
        data: { freeGenUsed: { decrement: Math.min(points, user.freeGenUsed) } },
      });
      this.logger.log(`Included plan credits refunded: ${userId} (${description})`);
      return;
    }

    if (deduction.source === 'credits') {
      const newBalance = user.credits + points;
      await this.prisma.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });
      await this.prisma.creditTransaction.create({
        data: {
          userId,
          type: 'refund',
          amount: points,
          balance: newBalance,
          description,
        },
      });
      this.logger.log(
        `Credit refunded: ${userId} +${points} (${description}), balance: ${newBalance}`,
      );
    }
  }

  async addCredits(userId: string, points: number, orderId?: string): Promise<{ balance: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    const newBalance = (user?.credits || 0) + points;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });

    await this.prisma.creditTransaction.create({
      data: {
        userId,
        type: 'topup',
        amount: points,
        balance: newBalance,
        description: `購買 ${points} 點`,
        orderId,
        expiresAt,
      },
    });

    this.logger.log(
      `Credits added: ${userId} +${points}, balance: ${newBalance}, expires: ${expiresAt.toISOString().slice(0, 10)}`,
    );
    return { balance: newBalance };
  }

  async getBalance(userId: string) {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, freeGenUsed: true, freeGenResetAt: true, plan: true },
    });
    if (!user) return null;

    await this.resetMonthlyIfNeeded(userId, user);
    user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, freeGenUsed: true, freeGenResetAt: true, plan: true },
    });
    if (!user) return null;

    const includedCredits = PLAN_MONTHLY_INCLUDED_CREDITS[user.plan] ?? 0;

    const transactions = await this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        type: true,
        amount: true,
        balance: true,
        description: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const expiringSoon = await this.prisma.creditTransaction.aggregate({
      where: {
        userId,
        type: 'topup',
        expiresAt: { lte: thirtyDaysLater, gte: new Date() },
      },
      _sum: { amount: true },
    });

    return {
      credits: user.credits,
      freeGenerations: {
        used: includedCredits > 0 ? user.freeGenUsed : 0,
        total: includedCredits,
        remaining: Math.max(0, includedCredits - user.freeGenUsed),
        resetsAt: user.freeGenResetAt,
      },
      expiringSoon: expiringSoon._sum.amount || 0,
      transactions,
    };
  }

  private async resetMonthlyIfNeeded(
    userId: string,
    user: { freeGenResetAt: Date | null; freeGenUsed: number },
  ) {
    const now = new Date();
    if (!user.freeGenResetAt || now >= user.freeGenResetAt) {
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await this.prisma.user.update({
        where: { id: userId },
        data: { freeGenUsed: 0, freeGenResetAt: nextReset },
      });
    }
  }

  private async expireCredits(userId: string) {
    const now = new Date();
    const expiredTopups = await this.prisma.creditTransaction.findMany({
      where: {
        userId,
        type: 'topup',
        expiresAt: { lte: now },
      },
      select: { id: true, amount: true },
    });

    if (expiredTopups.length === 0) return;

    let totalExpired = 0;
    for (const topup of expiredTopups) {
      totalExpired += topup.amount;
      await this.prisma.creditTransaction.update({
        where: { id: topup.id },
        data: { type: 'expired' },
      });
    }

    if (totalExpired > 0) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      const newBalance = Math.max(0, (user?.credits || 0) - totalExpired);
      await this.prisma.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      await this.prisma.creditTransaction.create({
        data: {
          userId,
          type: 'expire',
          amount: -totalExpired,
          balance: newBalance,
          description: `${totalExpired} 點已過期（購買後 12 個月）`,
        },
      });

      this.logger.log(`Credits expired: ${userId} -${totalExpired}, new balance: ${newBalance}`);
    }
  }
}
