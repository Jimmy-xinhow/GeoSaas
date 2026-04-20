import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const FREE_MONTHLY_GENERATIONS = 10;

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
   * Priority: free monthly quota → purchased credits → denied
   *
   * @param userId - user ID
   * @param points - points to deduct (1 or 2)
   * @param description - what this charge is for
   * @returns CreditCheckResult
   */
  async checkAndDeduct(
    userId: string,
    points: number,
    description: string,
  ): Promise<CreditCheckResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, plan: true, role: true,
        credits: true, freeGenUsed: true, freeGenResetAt: true,
      },
    });

    if (!user) throw new ForbiddenException('User not found');

    // STAFF/ADMIN bypass all limits
    if (user.role === 'STAFF' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return { allowed: true, source: 'free' };
    }

    // Reset monthly free counter if needed
    await this.resetMonthlyIfNeeded(userId, user);

    // Reload after potential reset
    const freshUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, freeGenUsed: true, plan: true },
    });
    if (!freshUser) throw new ForbiddenException('User not found');

    // 1. Check free monthly quota (paid users only)
    const isPaid = freshUser.plan === 'STARTER' || freshUser.plan === 'PRO';
    if (isPaid && freshUser.freeGenUsed < FREE_MONTHLY_GENERATIONS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { freeGenUsed: { increment: 1 } },
      });

      return {
        allowed: true,
        source: 'free',
        freeRemaining: FREE_MONTHLY_GENERATIONS - freshUser.freeGenUsed - 1,
        creditsRemaining: freshUser.credits,
      };
    }

    // 2. Check purchased credits
    if (freshUser.credits >= points) {
      // Expire old credits first
      await this.expireCredits(userId);

      // Re-check after expiration
      const afterExpire = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if ((afterExpire?.credits || 0) < points) {
        return {
          allowed: false,
          source: 'denied',
          creditsRemaining: afterExpire?.credits || 0,
          message: `點數不足（需要 ${points} 點，剩餘 ${afterExpire?.credits || 0} 點）。部分點數可能已過期，請充值。`,
        };
      }

      // Deduct credits
      await this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: points } },
      });

      // Record transaction
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

      this.logger.log(`Credit deducted: ${userId} -${points} (${description}), balance: ${newBalance}`);

      return {
        allowed: true,
        source: 'credits',
        creditsRemaining: newBalance,
      };
    }

    // 3. Denied
    const freeMsg = isPaid
      ? `本月免費額度已用完（${FREE_MONTHLY_GENERATIONS}/${FREE_MONTHLY_GENERATIONS}）`
      : '免費用戶無每月免費額度';

    return {
      allowed: false,
      source: 'denied',
      freeRemaining: 0,
      creditsRemaining: freshUser.credits,
      message: `${freeMsg}，點數不足（需要 ${points} 點，剩餘 ${freshUser.credits} 點）。請先充值點數。`,
    };
  }

  /**
   * Add credits after payment
   */
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
        description: `充值 ${points} 點`,
        orderId,
        expiresAt,
      },
    });

    this.logger.log(`Credits added: ${userId} +${points}, balance: ${newBalance}, expires: ${expiresAt.toISOString().slice(0, 10)}`);
    return { balance: newBalance };
  }

  /**
   * Get user's credit balance and usage info
   */
  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, freeGenUsed: true, freeGenResetAt: true, plan: true },
    });
    if (!user) return null;

    const isPaid = user.plan === 'STARTER' || user.plan === 'PRO';

    // Get recent transactions
    const transactions = await this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { type: true, amount: true, balance: true, description: true, expiresAt: true, createdAt: true },
    });

    // Calculate expiring soon (within 30 days)
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
        used: isPaid ? user.freeGenUsed : 0,
        total: isPaid ? FREE_MONTHLY_GENERATIONS : 0,
        remaining: isPaid ? Math.max(0, FREE_MONTHLY_GENERATIONS - user.freeGenUsed) : 0,
        resetsAt: user.freeGenResetAt,
      },
      expiringSoon: expiringSoon._sum.amount || 0,
      transactions,
    };
  }

  /**
   * Reset monthly free generation counter if past reset date
   */
  private async resetMonthlyIfNeeded(userId: string, user: { freeGenResetAt: Date | null; freeGenUsed: number }) {
    const now = new Date();
    if (!user.freeGenResetAt || now >= user.freeGenResetAt) {
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1); // 1st of next month
      await this.prisma.user.update({
        where: { id: userId },
        data: { freeGenUsed: 0, freeGenResetAt: nextReset },
      });
    }
  }

  /**
   * Expire credits older than 12 months
   */
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

    // Calculate total expired points (only unexpired portion)
    let totalExpired = 0;
    for (const topup of expiredTopups) {
      totalExpired += topup.amount;
      // Mark as expired by changing type
      await this.prisma.creditTransaction.update({
        where: { id: topup.id },
        data: { type: 'expired' },
      });
    }

    if (totalExpired > 0) {
      // Deduct expired credits from user balance
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
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
          description: `${totalExpired} 點已到期（購買超過 12 個月）`,
        },
      });

      this.logger.log(`Credits expired: ${userId} -${totalExpired}, new balance: ${newBalance}`);
    }
  }
}
