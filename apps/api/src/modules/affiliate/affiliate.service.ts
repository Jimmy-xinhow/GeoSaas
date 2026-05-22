import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplyAffiliateDto,
  ProcessWithdrawalDto,
  RequestWithdrawalDto,
  ReviewAffiliateDto,
  TrackAffiliateClickDto,
  UpdateAffiliateSettingsDto,
  UpdateAffiliateTierDto,
} from './dto/affiliate.dto';
import {
  AFFILIATE_CONFIG,
  AffiliateProgramSettings,
  DEFAULT_AFFILIATE_SETTINGS,
  getAffiliateTierRate,
} from './affiliate.config';

type ClickMeta = {
  ip?: string;
  userAgent?: string;
};

const AFFILIATE_SETTINGS_KEY = 'affiliate.settings';

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getAdminSettings() {
    return {
      settings: await this.getProgramSettings(),
      tiers: [
        { key: 'standard', label: '標準' },
        { key: 'gold', label: '金牌' },
        { key: 'platinum', label: '白金' },
      ],
    };
  }

  async updateAdminSettings(dto: UpdateAffiliateSettingsDto) {
    if (!dto.allowBankTransfer && !dto.allowPlatformCredits) {
      throw new BadRequestException('At least one withdrawal method must be enabled');
    }

    const settings: AffiliateProgramSettings = {
      applicationEnabled: dto.applicationEnabled,
      autoApproveApplications: dto.autoApproveApplications,
      defaultCommissionRate: dto.tierRates.standard,
      tierRates: {
        standard: dto.tierRates.standard,
        gold: dto.tierRates.gold,
        platinum: dto.tierRates.platinum,
      },
      cookieWindowDays: dto.cookieWindowDays,
      minWithdrawalAmount: dto.minWithdrawalAmount,
      commissionLockDays: dto.commissionLockDays,
      allowBankTransfer: dto.allowBankTransfer,
      allowPlatformCredits: dto.allowPlatformCredits,
      clickDedupeWindowSeconds: AFFILIATE_CONFIG.clickDedupeWindowSeconds,
      annualTaxThreshold: dto.annualTaxThreshold,
      programTerms: dto.programTerms.trim(),
      landingPageIntro: dto.landingPageIntro.trim(),
    };

    const saved = await this.prisma.systemConfig.upsert({
      where: { key: AFFILIATE_SETTINGS_KEY },
      update: {
        value: JSON.stringify(settings),
        description: 'Affiliate program global settings',
      },
      create: {
        key: AFFILIATE_SETTINGS_KEY,
        value: JSON.stringify(settings),
        description: 'Affiliate program global settings',
      },
    });

    if (dto.applyTierRatesToExisting) {
      await Promise.all(
        (['standard', 'gold', 'platinum'] as const).map((tier) =>
          this.prisma.affiliate.updateMany({
            where: { tier },
            data: { commissionRate: settings.tierRates[tier] },
          }),
        ),
      );
    }

    return { settings: this.parseProgramSettings(saved.value), appliedToExisting: Boolean(dto.applyTierRatesToExisting) };
  }

  async getAdminOverview() {
    const [
      totalAffiliates,
      pendingAffiliates,
      approvedAffiliates,
      suspendedAffiliates,
      totals,
      pendingWithdrawalAmount,
      completedWithdrawalAmount,
      pendingCommissions,
      paidCommissions,
      recentCommissions,
      recentWithdrawals,
    ] = await Promise.all([
      this.prisma.affiliate.count(),
      this.prisma.affiliate.count({ where: { status: 'pending' } }),
      this.prisma.affiliate.count({ where: { status: 'approved' } }),
      this.prisma.affiliate.count({ where: { status: 'suspended' } }),
      this.prisma.affiliate.aggregate({
        _sum: {
          totalClicks: true,
          totalSignups: true,
          totalConversions: true,
          totalCommissionEarned: true,
          totalCommissionPaid: true,
          pendingCommission: true,
        },
      }),
      this.prisma.affiliateWithdrawal.aggregate({
        where: { status: { in: ['pending', 'processing'] } },
        _sum: { amount: true },
      }),
      this.prisma.affiliateWithdrawal.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { status: 'pending' },
        _sum: { commissionAmount: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { status: 'paid' },
        _sum: { commissionAmount: true },
      }),
      this.prisma.affiliateCommission.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          affiliate: { include: { user: { select: { id: true, email: true, name: true } } } },
          referredUser: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.affiliateWithdrawal.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { affiliate: { include: { user: { select: { id: true, email: true, name: true } } } } },
      }),
    ]);

    const clicks = totals._sum.totalClicks ?? 0;
    const signups = totals._sum.totalSignups ?? 0;
    const conversions = totals._sum.totalConversions ?? 0;

    return {
      counts: {
        totalAffiliates,
        pendingAffiliates,
        approvedAffiliates,
        suspendedAffiliates,
      },
      funnel: {
        clicks,
        signups,
        conversions,
        signupRate: clicks ? Math.round((signups / clicks) * 1000) / 10 : 0,
        conversionRate: signups ? Math.round((conversions / signups) * 1000) / 10 : 0,
      },
      money: {
        totalCommissionEarned: totals._sum.totalCommissionEarned ?? 0,
        totalCommissionPaid: totals._sum.totalCommissionPaid ?? 0,
        pendingCommission: totals._sum.pendingCommission ?? 0,
        pendingWithdrawalAmount: pendingWithdrawalAmount._sum.amount ?? 0,
        completedWithdrawalAmount: completedWithdrawalAmount._sum.amount ?? 0,
        pendingCommissionAmount: pendingCommissions._sum.commissionAmount ?? 0,
        paidCommissionAmount: paidCommissions._sum.commissionAmount ?? 0,
      },
      recentCommissions,
      recentWithdrawals,
    };
  }

  async submitApplication(userId: string, dto: ApplyAffiliateDto) {
    const settings = await this.getProgramSettings();
    if (!settings.applicationEnabled) {
      throw new ForbiddenException('Affiliate applications are currently closed');
    }

    const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (existing && !['rejected', 'suspended'].includes(existing.status)) {
      throw new ConflictException('Affiliate application already exists');
    }

    const data = {
      realName: dto.realName,
      contactEmail: dto.contactEmail,
      websiteUrl: dto.websiteUrl,
      promotionChannel: dto.promotionChannel,
      audienceDescription: dto.audienceDescription,
      payoutMethod: dto.payoutMethod ?? 'bank_transfer',
      bankName: dto.bankName,
      bankBranch: dto.bankBranch,
      bankAccountNumber: dto.bankAccountNumber,
      bankAccountName: dto.bankAccountName,
      status: settings.autoApproveApplications ? 'approved' : 'pending',
      reviewNote: null,
      rejectionReason: null,
      reviewedAt: settings.autoApproveApplications ? new Date() : null,
      reviewedById: null,
    };

    if (existing) {
      return this.prisma.affiliate.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.affiliate.create({
      data: {
        ...data,
        userId,
        affiliateCode: await this.generateUniqueCode(),
        tier: 'standard',
        commissionRate: getAffiliateTierRate('standard', settings),
      },
    });
  }

  async getMyStatus(userId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) return { hasApplication: false };
    return {
      hasApplication: true,
      affiliate: this.sanitizeAffiliate(affiliate),
    };
  }

  async getDashboard(userId: string) {
    const affiliate = await this.requireAffiliateByUser(userId);
    const settings = await this.getProgramSettings();
    const [recentCommissions, recentWithdrawals, availableCommission] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          referredUser: { select: { id: true, email: true, name: true } },
          order: { select: { plan: true, amount: true, paidAt: true } },
        },
      }),
      this.prisma.affiliateWithdrawal.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.getAvailableCommissionAmount(affiliate.id),
    ]);

    return {
      affiliate: this.sanitizeAffiliate(affiliate),
      trackingLink: this.buildTrackingLink(affiliate.affiliateCode),
      availableCommission,
      minWithdrawalAmount: settings.minWithdrawalAmount,
      payoutMethods: {
        bankTransfer: settings.allowBankTransfer,
        platformCredits: settings.allowPlatformCredits,
      },
      recentCommissions: recentCommissions.map((commission) => this.sanitizeMemberCommission(commission)),
      recentWithdrawals,
    };
  }

  async getTrackingLink(userId: string) {
    const affiliate = await this.requireAffiliateByUser(userId);
    const settings = await this.getProgramSettings();
    return {
      affiliateCode: affiliate.affiliateCode,
      trackingLink: this.buildTrackingLink(affiliate.affiliateCode),
      cookieWindowDays: settings.cookieWindowDays,
    };
  }

  async getReferralDetails(userId: string) {
    const affiliate = await this.requireAffiliateByUser(userId);
    if (affiliate.status !== 'approved') throw new ForbiddenException('Affiliate is not approved');

    const [clicks, signups, commissions, landingPages, availableCommission] = await Promise.all([
      this.prisma.affiliateClick.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          landingPage: true,
          convertedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findMany({
        where: { affiliateReferrerId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          createdAt: true,
          orders: {
            where: { status: 'PAID' },
            orderBy: { paidAt: 'desc' },
            take: 1,
            select: {
              plan: true,
              amount: true,
              paidAt: true,
            },
          },
        },
      }),
      this.prisma.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          referredUser: { select: { id: true, email: true, name: true } },
          order: { select: { plan: true, amount: true, paidAt: true } },
        },
      }),
      this.prisma.affiliateClick.groupBy({
        by: ['landingPage'],
        where: { affiliateId: affiliate.id },
        _count: { id: true },
      }),
      this.getAvailableCommissionAmount(affiliate.id),
    ]);

    const landingPageStats = landingPages
      .map((item) => ({
        landingPage: item.landingPage || '未記錄來源頁',
        clicks: item._count.id,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    return {
      summary: {
        totalClicks: affiliate.totalClicks,
        totalSignups: affiliate.totalSignups,
        totalConversions: affiliate.totalConversions,
        totalCommissionEarned: affiliate.totalCommissionEarned,
        totalCommissionPaid: affiliate.totalCommissionPaid,
        pendingCommission: affiliate.pendingCommission,
        availableCommission,
      },
      landingPages: landingPageStats,
      clicks: clicks.map((click) => ({
        id: click.id,
        landingPage: click.landingPage || '未記錄來源頁',
        status: click.convertedAt ? 'registered' : 'clicked',
        clickedAt: click.createdAt,
        convertedAt: click.convertedAt,
      })),
      signups: signups.map((user) => {
        const latestPaidOrder = user.orders[0];
        return {
          id: user.id,
          displayName: this.maskName(user.name),
          email: this.maskEmail(user.email),
          plan: user.plan,
          signedUpAt: user.createdAt,
          hasPaid: Boolean(latestPaidOrder),
          latestPaidPlan: latestPaidOrder?.plan ?? null,
          latestPaidAmount: latestPaidOrder?.amount ?? null,
          latestPaidAt: latestPaidOrder?.paidAt ?? null,
        };
      }),
      commissions: commissions.map((commission) => ({
        id: commission.id,
        referredUser: {
          id: commission.referredUser.id,
          displayName: this.maskName(commission.referredUser.name),
          email: this.maskEmail(commission.referredUser.email),
        },
        orderPlan: commission.order.plan,
        paymentAmount: commission.paymentAmount,
        orderAmount: commission.order.amount,
        paidAt: commission.order.paidAt,
        commissionRate: commission.commissionRate,
        commissionAmount: commission.commissionAmount,
        status: commission.status,
        lockedUntil: commission.lockedUntil,
        createdAt: commission.createdAt,
      })),
    };
  }

  async recordClick(dto: TrackAffiliateClickDto, meta: ClickMeta = {}) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { affiliateCode: dto.affiliateCode.trim() },
    });
    if (!affiliate || affiliate.status !== 'approved') {
      return { ok: true };
    }

    const dedupeSince = new Date(Date.now() - AFFILIATE_CONFIG.clickDedupeWindowSeconds * 1000);
    const existing = await this.prisma.affiliateClick.findFirst({
      where: {
        affiliateId: affiliate.id,
        visitorId: dto.visitorId,
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (existing) return { ok: true, deduped: true };

    await this.prisma.$transaction([
      this.prisma.affiliateClick.create({
        data: {
          affiliateId: affiliate.id,
          affiliateCode: affiliate.affiliateCode,
          visitorId: dto.visitorId,
          ipHash: meta.ip ? this.hash(meta.ip) : undefined,
          userAgent: meta.userAgent,
          landingPage: dto.landingPage,
        },
      }),
      this.prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { totalClicks: { increment: 1 } },
      }),
    ]);

    return { ok: true };
  }

  async attributeSignup(userId: string, affiliateCode?: string, visitorId?: string) {
    const code = affiliateCode?.trim();
    if (!code) return;
    const settings = await this.getProgramSettings();

    const [user, affiliate] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, affiliateReferrerId: true },
      }),
      this.prisma.affiliate.findUnique({ where: { affiliateCode: code } }),
    ]);
    if (!user || user.affiliateReferrerId || !affiliate || affiliate.status !== 'approved') return;
    if (affiliate.userId === userId) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { affiliateReferrerId: affiliate.id },
      });
      await tx.affiliate.update({
        where: { id: affiliate.id },
        data: { totalSignups: { increment: 1 } },
      });

      if (visitorId) {
        const latestClick = await tx.affiliateClick.findFirst({
          where: {
            affiliateId: affiliate.id,
            visitorId,
            convertedUserId: null,
            createdAt: {
              gte: new Date(Date.now() - settings.cookieWindowDays * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (latestClick) {
          await tx.affiliateClick.update({
            where: { id: latestClick.id },
            data: { convertedUserId: userId, convertedAt: new Date() },
          });
        }
      }
    });
  }

  async calculateCommission(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          include: {
            affiliateReferrer: true,
          },
        },
      },
    });
    if (!order || order.status !== 'PAID' || order.plan.startsWith('CREDITS_')) return null;

    const affiliate = order.user.affiliateReferrer;
    if (!affiliate || affiliate.status !== 'approved') return null;
    if (affiliate.userId === order.userId) return null;

    const existing = await this.prisma.affiliateCommission.findUnique({
      where: { orderId: order.id },
    });
    if (existing) return existing;

    const settings = await this.getProgramSettings();
    const commissionRate = affiliate.commissionRate || getAffiliateTierRate(affiliate.tier, settings);
    const commissionAmount = Math.round((order.amount * commissionRate) / 100);
    const lockedUntil = new Date(Date.now() + settings.commissionLockDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const commission = await tx.affiliateCommission.create({
        data: {
          affiliateId: affiliate.id,
          affiliateUserId: affiliate.userId,
          referredUserId: order.userId,
          orderId: order.id,
          paymentAmount: order.amount,
          commissionRate,
          commissionAmount,
          status: 'pending',
          lockedUntil,
        },
      });
      await tx.affiliate.update({
        where: { id: affiliate.id },
        data: {
          totalConversions: { increment: 1 },
          totalCommissionEarned: { increment: commissionAmount },
          pendingCommission: { increment: commissionAmount },
        },
      });
      return commission;
    });
  }

  async getCommissions(userId: string, page = 1, limit = 20) {
    const affiliate = await this.requireAffiliateByUser(userId);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          referredUser: { select: { id: true, email: true, name: true } },
          order: { select: { plan: true, amount: true, paidAt: true } },
        },
      }),
      this.prisma.affiliateCommission.count({ where: { affiliateId: affiliate.id } }),
    ]);
    return { items: items.map((commission) => this.sanitizeMemberCommission(commission)), total, page, limit };
  }

  async getWithdrawals(userId: string, page = 1, limit = 20) {
    const affiliate = await this.requireAffiliateByUser(userId);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.affiliateWithdrawal.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.affiliateWithdrawal.count({ where: { affiliateId: affiliate.id } }),
    ]);
    return { items, total, page, limit };
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    const affiliate = await this.requireAffiliateByUser(userId);
    const settings = await this.getProgramSettings();
    if (affiliate.status !== 'approved') throw new ForbiddenException('Affiliate is not approved');
    if (dto.type === 'bank_transfer' && !settings.allowBankTransfer) {
      throw new BadRequestException('Bank transfer withdrawal is disabled');
    }
    if (dto.type === 'platform_credits' && !settings.allowPlatformCredits) {
      throw new BadRequestException('Platform credits withdrawal is disabled');
    }
    if (dto.amount < settings.minWithdrawalAmount) {
      throw new BadRequestException(`Minimum withdrawal amount is ${settings.minWithdrawalAmount}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const existingPending = await tx.affiliateWithdrawal.findFirst({
        where: { affiliateId: affiliate.id, status: { in: ['pending', 'processing'] } },
        select: { id: true },
      });
      if (existingPending) throw new ConflictException('There is already a pending withdrawal');

      const commissions = await tx.affiliateCommission.findMany({
        where: {
          affiliateId: affiliate.id,
          status: 'pending',
          withdrawalId: null,
          lockedUntil: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
      });

      let selectedAmount = 0;
      const selectedIds: string[] = [];
      for (const commission of commissions) {
        if (selectedAmount >= dto.amount) break;
        selectedIds.push(commission.id);
        selectedAmount += commission.commissionAmount;
      }
      if (selectedAmount < dto.amount) {
        throw new BadRequestException('Available commission is not enough');
      }

      const withdrawal = await tx.affiliateWithdrawal.create({
        data: {
          affiliateId: affiliate.id,
          affiliateUserId: affiliate.userId,
          amount: selectedAmount,
          type: dto.type,
          status: 'pending',
          taxYear: new Date().getFullYear(),
          bankSnapshot: dto.type === 'bank_transfer' ? this.buildBankSnapshot(affiliate) : Prisma.JsonNull,
        },
      });
      await tx.affiliateCommission.updateMany({
        where: { id: { in: selectedIds } },
        data: { status: 'approved', withdrawalId: withdrawal.id },
      });
      await tx.affiliate.update({
        where: { id: affiliate.id },
        data: { pendingCommission: { decrement: selectedAmount } },
      });
      return withdrawal;
    });
  }

  async listAdminAffiliates(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.affiliate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.affiliate.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listAdminCommissions(affiliateId?: string, page = 1, limit = 20) {
    const where = affiliateId ? { affiliateId } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          affiliate: { include: { user: { select: { id: true, email: true, name: true } } } },
          referredUser: { select: { id: true, email: true, name: true } },
          order: { select: { merchantOrderNo: true, plan: true, amount: true, paidAt: true } },
        },
      }),
      this.prisma.affiliateCommission.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listAdminWithdrawals(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.affiliateWithdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { affiliate: { include: { user: { select: { id: true, email: true, name: true } } } } },
      }),
      this.prisma.affiliateWithdrawal.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async reviewAffiliate(id: string, reviewerId: string, dto: ReviewAffiliateDto) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Affiliate not found');
    if (dto.decision === 'rejected' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.prisma.affiliate.update({
      where: { id },
      data: {
        status: dto.decision,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.note,
        rejectionReason: dto.decision === 'rejected' ? dto.rejectionReason : null,
      },
    });
  }

  async updateTier(id: string, dto: UpdateAffiliateTierDto) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Affiliate not found');
    const settings = await this.getProgramSettings();
    return this.prisma.affiliate.update({
      where: { id },
      data: {
        tier: dto.tier,
        commissionRate: getAffiliateTierRate(dto.tier, settings),
      },
    });
  }

  async suspend(id: string, reviewerId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Affiliate not found');
    return this.prisma.affiliate.update({
      where: { id },
      data: {
        status: 'suspended',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  async processWithdrawal(id: string, adminUserId: string, dto: ProcessWithdrawalDto) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.affiliateWithdrawal.findUnique({
        where: { id },
        include: { affiliate: true, commissions: true },
      });
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (!['pending', 'processing'].includes(withdrawal.status)) {
        throw new BadRequestException('Withdrawal has already been processed');
      }
      if (dto.decision === 'rejected' && !dto.rejectionReason?.trim()) {
        throw new BadRequestException('Rejection reason is required');
      }

      if (dto.decision === 'rejected') {
        await tx.affiliateCommission.updateMany({
          where: { withdrawalId: withdrawal.id },
          data: { status: 'pending', withdrawalId: null },
        });
        await tx.affiliate.update({
          where: { id: withdrawal.affiliateId },
          data: { pendingCommission: { increment: withdrawal.amount } },
        });
      } else {
        await tx.affiliateCommission.updateMany({
          where: { withdrawalId: withdrawal.id },
          data: { status: 'paid' },
        });
        await tx.affiliate.update({
          where: { id: withdrawal.affiliateId },
          data: { totalCommissionPaid: { increment: withdrawal.amount } },
        });
        if (withdrawal.type === 'platform_credits') {
          const credits = Math.max(1, Math.floor(withdrawal.amount / 5));
          const user = await tx.user.update({
            where: { id: withdrawal.affiliateUserId },
            data: { credits: { increment: credits } },
            select: { credits: true },
          });
          await tx.creditTransaction.create({
            data: {
              userId: withdrawal.affiliateUserId,
              type: 'topup',
              amount: credits,
              balance: user.credits,
              description: `Affiliate commission converted to ${credits} credits`,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          });
        }
      }

      return tx.affiliateWithdrawal.update({
        where: { id },
        data: {
          status: dto.decision === 'completed' ? 'completed' : 'rejected',
          processedById: adminUserId,
          processedAt: new Date(),
          processNote: dto.note,
          rejectionReason: dto.decision === 'rejected' ? dto.rejectionReason : null,
        },
      });
    });
  }

  async getTaxReport(year: number) {
    const settings = await this.getProgramSettings();
    const rows = await this.prisma.affiliateWithdrawal.groupBy({
      by: ['affiliateUserId'],
      where: { taxYear: year, status: 'completed' },
      _sum: { amount: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.affiliateUserId) } },
      select: { id: true, email: true, name: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return rows
      .map((row) => ({
        user: userMap.get(row.affiliateUserId),
        amount: row._sum.amount ?? 0,
        overAnnualTaxThreshold: (row._sum.amount ?? 0) >= settings.annualTaxThreshold,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private async getProgramSettings(): Promise<AffiliateProgramSettings> {
    const stored = await this.prisma.systemConfig.findUnique({
      where: { key: AFFILIATE_SETTINGS_KEY },
      select: { value: true },
    });
    return this.parseProgramSettings(stored?.value);
  }

  private parseProgramSettings(value?: string | null): AffiliateProgramSettings {
    if (!value) return DEFAULT_AFFILIATE_SETTINGS;

    try {
      const parsed = JSON.parse(value) as Partial<AffiliateProgramSettings>;
      return {
        ...DEFAULT_AFFILIATE_SETTINGS,
        ...parsed,
        tierRates: {
          ...DEFAULT_AFFILIATE_SETTINGS.tierRates,
          ...(parsed.tierRates ?? {}),
        },
      };
    } catch {
      return DEFAULT_AFFILIATE_SETTINGS;
    }
  }

  private async requireAffiliateByUser(userId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) throw new NotFoundException('Affiliate application not found');
    return affiliate;
  }

  private async getAvailableCommissionAmount(affiliateId: string): Promise<number> {
    const result = await this.prisma.affiliateCommission.aggregate({
      where: {
        affiliateId,
        status: 'pending',
        withdrawalId: null,
        lockedUntil: { lte: new Date() },
      },
      _sum: { commissionAmount: true },
    });
    return result._sum.commissionAmount ?? 0;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = `GV${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.prisma.affiliate.findUnique({ where: { affiliateCode: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to generate affiliate code');
  }

  private buildTrackingLink(code: string): string {
    const webUrl = this.config.get<string>('FRONTEND_URL') || this.config.get<string>('WEB_URL') || 'https://www.geovault.app';
    return `${webUrl.replace(/\/$/, '')}/?aff=${encodeURIComponent(code)}`;
  }

  private buildBankSnapshot(affiliate: {
    bankName: string | null;
    bankBranch: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
  }): Prisma.InputJsonValue {
    return {
      bankName: affiliate.bankName,
      bankBranch: affiliate.bankBranch,
      bankAccountName: affiliate.bankAccountName,
      bankAccountNumber: affiliate.bankAccountNumber
        ? affiliate.bankAccountNumber.replace(/.(?=.{4})/g, '*')
        : null,
    };
  }

  private sanitizeAffiliate<T extends { bankAccountNumber: string | null }>(affiliate: T) {
    return {
      ...affiliate,
      bankAccountNumber: affiliate.bankAccountNumber
        ? affiliate.bankAccountNumber.replace(/.(?=.{4})/g, '*')
        : null,
    };
  }

  private sanitizeMemberCommission<
    T extends {
      referredUser: { id: string; email: string; name: string | null };
    },
  >(commission: T) {
    return {
      ...commission,
      referredUser: {
        ...commission.referredUser,
        name: this.maskName(commission.referredUser.name),
        email: this.maskEmail(commission.referredUser.email),
      },
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return this.maskName(email);
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
  }

  private maskName(name?: string | null): string {
    if (!name) return '未提供姓名';
    const trimmed = name.trim();
    if (trimmed.length <= 1) return `${trimmed}*`;
    return `${trimmed.slice(0, 1)}${'*'.repeat(Math.min(trimmed.length - 1, 4))}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
