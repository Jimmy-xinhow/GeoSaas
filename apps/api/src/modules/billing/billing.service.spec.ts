import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { CreditService } from './credit.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import * as newebpayUtil from './newebpay.util';

jest.mock('./newebpay.util');

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    scan: { count: jest.Mock };
    site: { count: jest.Mock };
    order: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    notification: { create: jest.Mock; createMany: jest.Mock };
  };
  let creditService: { addCredits: jest.Mock };
  let affiliateService: { calculateCommission: jest.Mock };

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      scan: { count: jest.fn() },
      site: { count: jest.fn() },
      order: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      notification: { create: jest.fn(), createMany: jest.fn() },
    };
    creditService = { addCredits: jest.fn().mockResolvedValue({}) };
    affiliateService = { calculateCommission: jest.fn().mockResolvedValue(null) };

    const configGet = jest.fn((key: string) => {
      const map: Record<string, string> = {
        NEWEBPAY_MERCHANT_ID: 'TestMerchant',
        NEWEBPAY_HASH_KEY: '12345678901234567890123456789012',
        NEWEBPAY_HASH_IV: '1234567890123456',
        NEWEBPAY_API_URL: 'https://ccore.newebpay.com/MPG/mpg_gateway',
        FRONTEND_URL: 'http://localhost:3001',
        API_PUBLIC_URL: 'http://localhost:4000',
      };
      return map[key] || '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: PlanUsageService,
          useValue: {
            getUsageSummary: jest.fn().mockResolvedValue({ scansThisMonth: 15, sitesCount: 3 }),
          },
        },
        {
          provide: CreditService,
          useValue: creditService,
        },
        {
          provide: AffiliateService,
          useValue: affiliateService,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createOrder', () => {
    it('should create monthly self-service subscription using NewebPay period payment fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      const result = await service.createOrder('PRO', userId);

      expect(newebpayUtil.encryptTradeInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          MerOrderNo: expect.stringMatching(/^GEO/),
          ProdDesc: 'Geovault Pro 方案 月繳訂閱',
          PeriodAmt: 1090,
          PeriodType: 'M',
          PeriodStartType: '2',
          PeriodTimes: '48',
          ReturnURL: 'http://localhost:4000/api/billing/period/return',
          NotifyURL: 'http://localhost:4000/api/billing/period/notify',
          BackURL: 'http://localhost:3001/settings',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId, plan: 'PRO', amount: 1090, status: 'PENDING' }),
        }),
      );
      expect(result).toEqual({
        paymentUrl: 'https://ccore.newebpay.com/MPG/period',
        MerchantID_: 'TestMerchant',
        PostData_: 'period_post_data',
        paymentType: 'PERIOD',
      });
    });

    it('should create yearly self-service subscription with 4 yearly periods', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      await service.createOrder('STARTER', userId, 'yearly');

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            plan: 'STARTER',
            amount: 7452,
            rawResponse: expect.objectContaining({
              billingCycle: 'yearly',
              periodTimes: '4',
            }),
          }),
        }),
      );
      expect(newebpayUtil.encryptTradeInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          ProdDesc: 'Geovault Starter 方案 年繳訂閱',
          PeriodAmt: 7452,
          PeriodType: 'Y',
          PeriodPoint: expect.stringMatching(/^\d{4}$/),
          PeriodTimes: '4',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
    });

    it('should throw for invalid plan', async () => {
      await expect(service.createOrder('INVALID', userId)).rejects.toThrow(BadRequestException);
    });

    it('should create managed order using NewebPay period payment fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      const result = await service.createManagedOrder({
        plan: 'MANAGED_PRO',
        acceptedTerms: true,
        termsVersion: 'managed-service-2026-05-19',
      }, userId);

      expect(newebpayUtil.encryptTradeInfo).toHaveBeenLastCalledWith(
        expect.objectContaining({
          MerOrderNo: expect.stringMatching(/^MNG/),
          ProdDesc: 'GEOvault Managed Pro 代營運方案 月繳',
          PeriodAmt: 15000,
          PeriodType: 'M',
          PeriodStartType: '2',
          PeriodTimes: '48',
          ReturnURL: 'http://localhost:4000/api/billing/period/return',
          NotifyURL: 'http://localhost:4000/api/billing/period/notify',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
      expect(result).toEqual({
        paymentUrl: 'https://ccore.newebpay.com/MPG/period',
        MerchantID_: 'TestMerchant',
        PostData_: 'period_post_data',
        paymentType: 'PERIOD',
      });
    });

    it('should create yearly managed subscription with annual discounted amount', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      await service.createManagedOrder({
        plan: 'MANAGED_BASIC',
        billingCycle: 'yearly',
        acceptedTerms: true,
        termsVersion: 'managed-service-2026-05-19',
      }, userId);

      expect(prisma.order.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            plan: 'MANAGED_BASIC',
            amount: 84240,
            rawResponse: expect.objectContaining({ billingCycle: 'yearly' }),
          }),
        }),
      );
      expect(newebpayUtil.encryptTradeInfo).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ProdDesc: 'GEOvault Managed Basic 代營運方案 年繳',
          PeriodAmt: 84240,
          PeriodType: 'Y',
          PeriodPoint: expect.stringMatching(/^\d{4}$/),
          PeriodTimes: '4',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
    });

    it('should use production NewebPay period gateway when NEWEBPAY_MODE is production', async () => {
      const productionConfig = {
        get: jest.fn((key: string) => {
          const map: Record<string, string> = {
            NEWEBPAY_MERCHANT_ID: 'TestMerchant',
            NEWEBPAY_HASH_KEY: '12345678901234567890123456789012',
            NEWEBPAY_HASH_IV: '1234567890123456',
            NEWEBPAY_MODE: 'production',
            API_PUBLIC_URL: 'https://api.geovault.app',
            FRONTEND_URL: 'https://geovault.app',
          };
          return map[key] || '';
        }),
      };
      const productionService = new BillingService(
        prisma as any,
        productionConfig as any,
        { getUsageSummary: jest.fn() } as any,
        creditService as any,
        affiliateService as any,
      );
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      const result = await productionService.createManagedOrder({
        plan: 'MANAGED_BASIC',
        acceptedTerms: true,
        termsVersion: 'managed-service-2026-05-19',
      }, userId);

      expect(result.paymentUrl).toBe('https://core.newebpay.com/MPG/period');
    });

    it('should use production NewebPay period gateway for self-service subscriptions', async () => {
      jest.clearAllMocks();
      const productionConfig = {
        get: jest.fn((key: string) => {
          const map: Record<string, string> = {
            NEWEBPAY_MERCHANT_ID: 'TestMerchant',
            NEWEBPAY_HASH_KEY: '12345678901234567890123456789012',
            NEWEBPAY_HASH_IV: '1234567890123456',
            NEWEBPAY_MODE: 'production',
            API_PUBLIC_URL: 'https://api.geovault.app',
            FRONTEND_URL: 'https://geovault.app',
          };
          return map[key] || '';
        }),
      };
      const productionService = new BillingService(
        prisma as any,
        productionConfig as any,
        { getUsageSummary: jest.fn() } as any,
        creditService as any,
        affiliateService as any,
      );
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('period_post_data');

      const result = await productionService.createOrder('PRO', userId);

      expect(result.paymentUrl).toBe('https://core.newebpay.com/MPG/period');
    });

    it('should reject localhost callback URLs in production', async () => {
      jest.clearAllMocks();
      (service as any).config.get = jest.fn((key: string) => {
        const map: Record<string, string> = {
          NODE_ENV: 'production',
          NEWEBPAY_API_URL: 'https://core.newebpay.com/MPG/mpg_gateway',
          API_PUBLIC_URL: 'http://localhost:4000',
          FRONTEND_URL: 'https://geovault.app',
        };
        return map[key] || '';
      });
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});

      await expect(service.createOrder('PRO', userId)).rejects.toThrow(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(newebpayUtil.encryptTradeInfo).not.toHaveBeenCalled();
    });

    it('should generate unique merchant order numbers for rapid repeated plan checkouts', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1778803000000);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('encrypted_data');
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA_HASH');

      await service.createOrder('STARTER', userId);
      await service.createOrder('STARTER', userId);

      const firstOrderNo = prisma.order.create.mock.calls[0][0].data.merchantOrderNo;
      const secondOrderNo = prisma.order.create.mock.calls[1][0].data.merchantOrderNo;
      expect(firstOrderNo).toMatch(/^GEO1778803000000/);
      expect(secondOrderNo).toMatch(/^GEO1778803000000/);
      expect(firstOrderNo).not.toBe(secondOrderNo);
    });
  });

  describe('createCreditOrder', () => {
    it('should generate unique merchant order numbers for rapid repeated credit checkouts', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1778803000000);
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('encrypted_data');
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA_HASH');

      await service.createCreditOrder(50, userId);
      await service.createCreditOrder(50, userId);

      expect(newebpayUtil.encryptTradeInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          ReturnURL: 'http://localhost:4000/api/billing/return',
          NotifyURL: 'http://localhost:4000/api/billing/notify',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );

      const firstOrderNo = prisma.order.create.mock.calls[0][0].data.merchantOrderNo;
      const secondOrderNo = prisma.order.create.mock.calls[1][0].data.merchantOrderNo;
      expect(firstOrderNo).toMatch(/^CRD1778803000000/);
      expect(secondOrderNo).toMatch(/^CRD1778803000000/);
      expect(firstOrderNo).not.toBe(secondOrderNo);
    });
  });

  describe('handlePeriodNotify', () => {
    it('should upgrade user plan after self-service period payment succeeds', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerOrderNo: 'GEO123', PeriodNo: 'PERIOD123', PeriodAmt: 1090 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      const result = await service.handlePeriodNotify('period_encrypted');

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: expect.objectContaining({
          status: 'PAID',
          tradeNo: 'PERIOD123',
          paymentType: 'PERIOD',
        }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          plan: 'PRO',
          planExpiresAt: expect.any(Date),
          planSource: 'paid_subscription',
        },
      });
      // 滾動到期制：首次授權成功 = 當期結束（月繳 +1 月）+ 7 天寬限，而不是永不過期
      const expiresAt: Date = prisma.user.update.mock.calls[0][0].data.planExpiresAt;
      const lowerBound = new Date();
      lowerBound.setMonth(lowerBound.getMonth() + 1);
      expect(expiresAt.getTime()).toBeGreaterThan(lowerBound.getTime());
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: 'subscription_paid',
        }),
      });
      expect(result).toEqual({ message: 'OK' });
    });

    it('should extend planExpiresAt and notify on successful renewal of a PAID subscription', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: {
          MerOrderNo: 'GEO123',
          TradeNo: 'TN_PERIOD_2',
          AuthDate: '2026-08-06',
          AlreadyTimes: '2',
          TotalTimes: '48',
          PeriodAmt: 1090,
        },
      });
      const previousExpiry = new Date('2026-07-13T00:00:00.000Z');
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PAID',
        tradeNo: 'PERIOD123',
        rawResponse: { Status: 'SUCCESS', billingCycle: 'monthly' },
      });
      prisma.user.findUnique.mockResolvedValue({ plan: 'PRO', planExpiresAt: previousExpiry });
      prisma.order.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      const result = await service.handlePeriodNotify('period_encrypted');

      // 續期紀錄寫入 rawResponse.periodAuths（不改 order.status）
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: {
          rawResponse: expect.objectContaining({
            periodAuths: expect.objectContaining({
              times_2: expect.objectContaining({ status: 'SUCCESS', tradeNo: 'TN_PERIOD_2', amount: 1090 }),
            }),
          }),
        },
      });
      expect(prisma.order.update.mock.calls[0][0].data).not.toHaveProperty('status');
      // planExpiresAt 往後延一期 + 寬限
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          planExpiresAt: expect.any(Date),
          planSource: 'paid_subscription',
        },
      });
      const newExpiry: Date = prisma.user.update.mock.calls[0][0].data.planExpiresAt;
      expect(newExpiry.getTime()).toBeGreaterThan(previousExpiry.getTime());
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId, type: 'subscription_renewed' }),
      });
      expect(result).toEqual({ message: 'OK' });
    });

    it('should notify payment_failed without downgrading or failing the order when a renewal charge fails', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'TRA10054',
        Message: '卡片授權失敗',
        Result: {
          MerOrderNo: 'GEO123',
          AlreadyTimes: '3',
          TotalTimes: '48',
        },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PAID',
        tradeNo: 'PERIOD123',
        rawResponse: { Status: 'SUCCESS', billingCycle: 'monthly' },
      });
      prisma.order.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      const result = await service.handlePeriodNotify('period_encrypted');

      // 不動用戶方案（寬限期由 planExpiresAt 自然到期降級）、不把已付款訂單改成 FAILED
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.order.update.mock.calls[0][0].data).not.toHaveProperty('status');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: {
          rawResponse: expect.objectContaining({
            periodAuths: expect.objectContaining({
              times_3: expect.objectContaining({ status: 'TRA10054' }),
            }),
          }),
        },
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId, type: 'payment_failed' }),
      });
      expect(result).toEqual({ message: 'OK' });
    });

    it('should ignore a resent renewal notification for an already-recorded period (idempotency)', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: {
          MerOrderNo: 'GEO123',
          TradeNo: 'TN_PERIOD_2',
          AlreadyTimes: '2',
          PeriodAmt: 1090,
        },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PAID',
        tradeNo: 'PERIOD123',
        rawResponse: {
          billingCycle: 'monthly',
          periodAuths: { times_2: { status: 'SUCCESS', tradeNo: 'TN_PERIOD_2' } },
        },
      });

      const result = await service.handlePeriodNotify('period_encrypted');

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'OK' });
    });

    it('should ignore a resent first-authorization notification for a PAID order', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerOrderNo: 'GEO123', PeriodNo: 'PERIOD123', TradeNo: 'PERIOD123', PeriodAmt: 1090 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PAID',
        tradeNo: 'PERIOD123',
        rawResponse: { Status: 'SUCCESS', billingCycle: 'monthly' },
      });

      const result = await service.handlePeriodNotify('period_encrypted');

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'OK' });
    });

    it('should restore the paid plan when a renewal succeeds after a lazy downgrade to FREE', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerOrderNo: 'GEO123', TradeNo: 'TN_PERIOD_5', AlreadyTimes: '5', PeriodAmt: 1090 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PAID',
        tradeNo: 'PERIOD123',
        rawResponse: { Status: 'SUCCESS', billingCycle: 'monthly' },
      });
      prisma.user.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null });
      prisma.order.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.handlePeriodNotify('period_encrypted');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          plan: 'PRO',
          planExpiresAt: expect.any(Date),
          planSource: 'paid_subscription',
        },
      });
    });

    it('should accept managed period payment without changing self-service plan', async () => {
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerOrderNo: 'MNG123', PeriodNo: 'PERIOD456', PeriodAmt: 15000 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'MNG123',
        userId,
        plan: 'MANAGED_PRO',
        amount: 15000,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.handlePeriodNotify('period_encrypted');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: 'managed_service_paid',
        }),
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should terminate self-service period subscription and downgrade when no other active plan exists', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        merchantOrderNo: 'GEO123',
        tradeNo: 'PERIOD123',
        userId,
        plan: 'PRO',
        amount: 1090,
        rawResponse: { Status: 'SUCCESS' },
      });
      prisma.order.update.mockResolvedValue({});
      prisma.order.findMany.mockResolvedValue([]);
      prisma.user.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ Status: 'SUCCESS', Message: 'OK' })),
      } as any);
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('alter_post_data');

      const result = await service.cancelSubscription('GEO123', userId, true);

      expect(newebpayUtil.encryptTradeInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          Version: '1.0',
          MerOrderNo: 'GEO123',
          PeriodNo: 'PERIOD123',
          AlterType: 'terminate',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://ccore.newebpay.com/MPG/period/AlterStatus',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: expect.objectContaining({
          rawResponse: expect.objectContaining({
            subscriptionStatus: 'terminated',
            terminateResponse: expect.objectContaining({ Status: 'SUCCESS' }),
          }),
        }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { plan: 'FREE', planExpiresAt: null, planSource: 'subscription_cancelled' },
      });
      expect(result.message).toContain('已終止');
    });

    it('should reject cancel when NewebPay terminate API fails', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        merchantOrderNo: 'GEO123',
        tradeNo: 'PERIOD123',
        userId,
        plan: 'PRO',
        amount: 1090,
        rawResponse: {},
      });
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ Status: 'ERROR', Message: 'not enabled' })),
      } as any);
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('alter_post_data');

      await expect(service.cancelSubscription('GEO123', userId, true)).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('handleNotify', () => {
    it('should verify SHA, decrypt, and upgrade user on success', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('VALID_SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'GEO123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 1090 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123', userId, plan: 'PRO', amount: 1090, status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      const result = await service.handleNotify('encrypted', 'VALID_SHA');

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: expect.objectContaining({ status: 'PAID', tradeNo: 'TN123' }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          plan: 'PRO',
          planExpiresAt: expect.any(Date),
          planSource: 'paid_subscription',
        },
      });
      expect(result).toEqual({ message: 'OK' });
    });

    it('should throw when TradeSha verification fails', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('EXPECTED');
      await expect(service.handleNotify('encrypted', 'WRONG')).rejects.toThrow(BadRequestException);
    });

    it('should reject successful payment notifications when amount mismatches the order', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'GEO123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 1 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1090,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});

      await expect(service.handleNotify('encrypted', 'SHA')).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should add credits only for a valid credit package order', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'CRD123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 250 },
      });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        merchantOrderNo: 'CRD123',
        userId,
        plan: 'CREDITS_50',
        amount: 250,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});

      await service.handleNotify('encrypted', 'SHA');

      expect(creditService.addCredits).toHaveBeenCalledWith(userId, 50, 'order-1');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should reject successful plan payments when stored plan and amount are inconsistent', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'GEO123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 1 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123',
        userId,
        plan: 'PRO',
        amount: 1,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});

      await expect(service.handleNotify('encrypted', 'SHA')).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO123' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should reject successful credit payments when stored package and amount are inconsistent', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'CRD123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 999 },
      });
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        merchantOrderNo: 'CRD123',
        userId,
        plan: 'CREDITS_999',
        amount: 999,
        status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});

      await expect(service.handleNotify('encrypted', 'SHA')).rejects.toThrow(BadRequestException);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'CRD123' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      expect(creditService.addCredits).not.toHaveBeenCalled();
    });

    it('should skip already paid orders', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS', Result: { MerchantOrderNo: 'GEO123' },
      });
      prisma.order.findUnique.mockResolvedValue({ merchantOrderNo: 'GEO123', status: 'PAID' });

      const result = await service.handleNotify('encrypted', 'SHA');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'OK' });
    });

    it('should mark order as FAILED when payment fails', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'FAILED', Result: { MerchantOrderNo: 'GEO456' },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO456', userId, status: 'PENDING',
      });
      prisma.order.update.mockResolvedValue({});

      await service.handleNotify('encrypted', 'SHA');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { merchantOrderNo: 'GEO456' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    it('should return plan with usage data', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'PRO' });
      prisma.scan.count.mockResolvedValue(15);
      prisma.site.count.mockResolvedValue(3);

      const result = await service.getSubscription(userId);
      expect(result).toEqual({
        plan: 'PRO',
        role: undefined,
        usage: { scansThisMonth: 15, sitesCount: 3 },
        activeSubscriptions: [],
        managedSubscriptions: [],
      });
    });

    it('should include paid managed subscriptions for dashboard-only review requests', async () => {
      const paidAt = new Date('2026-05-19T08:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ id: userId, plan: 'PRO', role: 'USER' });
      prisma.order.findMany.mockResolvedValue([
        {
          merchantOrderNo: 'MNG123',
          plan: 'MANAGED_PRO',
          amount: 15000,
          paidAt,
        },
      ]);

      const result = await service.getSubscription(userId);

      expect(prisma.order.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          userId,
          status: 'PAID',
          plan: { in: ['MANAGED_BASIC', 'MANAGED_PRO'] },
        },
        orderBy: { paidAt: 'desc' },
        select: {
          merchantOrderNo: true,
          plan: true,
          amount: true,
          paidAt: true,
          rawResponse: true,
        },
      });
      expect(result?.activeSubscriptions).toEqual([]);
      expect(result?.managedSubscriptions).toEqual([
        {
          orderNo: 'MNG123',
          plan: 'MANAGED_PRO',
          planLabel: 'GEOvault Managed Pro 代營運方案',
          amount: 15000,
          paidAt,
        },
      ]);
    });

    it('should return undefined plan when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.getSubscription(userId);
      expect(result).toBeNull();
    });
  });
});
