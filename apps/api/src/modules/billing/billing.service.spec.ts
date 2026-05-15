import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { CreditService } from './credit.service';
import * as newebpayUtil from './newebpay.util';

jest.mock('./newebpay.util');

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    scan: { count: jest.Mock };
    site: { count: jest.Mock };
    order: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let creditService: { addCredits: jest.Mock };

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      scan: { count: jest.fn() },
      site: { count: jest.fn() },
      order: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    creditService = { addCredits: jest.fn().mockResolvedValue({}) };

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
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createOrder', () => {
    it('should create order and return encrypted form data', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      prisma.order.create.mockResolvedValue({});
      (newebpayUtil.encryptTradeInfo as jest.Mock).mockReturnValue('encrypted_data');
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('SHA_HASH');

      const result = await service.createOrder('PRO', userId);

      expect(newebpayUtil.encryptTradeInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          ReturnURL: 'http://localhost:4000/api/billing/return',
          NotifyURL: 'http://localhost:4000/api/billing/notify',
          ClientBackURL: 'http://localhost:3001/settings',
        }),
        '12345678901234567890123456789012',
        '1234567890123456',
      );
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId, plan: 'PRO', amount: 690, status: 'PENDING' }),
        }),
      );
      expect(result).toEqual({
        paymentUrl: 'https://ccore.newebpay.com/MPG/mpg_gateway',
        MerchantID: 'TestMerchant',
        TradeInfo: 'encrypted_data',
        TradeSha: 'SHA_HASH',
        Version: '2.0',
      });
    });

    it('should throw for invalid plan', async () => {
      await expect(service.createOrder('INVALID', userId)).rejects.toThrow(BadRequestException);
    });

    it('should reject missing NewebPay gateway URL in production', async () => {
      jest.clearAllMocks();
      (service as any).config.get = jest.fn((key: string) => {
        const map: Record<string, string> = {
          NODE_ENV: 'production',
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

  describe('handleNotify', () => {
    it('should verify SHA, decrypt, and upgrade user on success', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('VALID_SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'GEO123', TradeNo: 'TN123', PaymentType: 'CREDIT', Amt: 690 },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123', userId, plan: 'PRO', amount: 690, status: 'PENDING',
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
        data: { plan: 'PRO' },
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
        amount: 690,
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
      });
    });

    it('should return undefined plan when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.getSubscription(userId);
      expect(result).toBeNull();
    });
  });
});
