import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../../prisma/prisma.service';
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

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      scan: { count: jest.fn() },
      site: { count: jest.fn() },
      order: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };

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

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId, plan: 'PRO', amount: 1490, status: 'PENDING' }),
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
  });

  describe('handleNotify', () => {
    it('should verify SHA, decrypt, and upgrade user on success', async () => {
      (newebpayUtil.generateTradeSha as jest.Mock).mockReturnValue('VALID_SHA');
      (newebpayUtil.decryptTradeInfo as jest.Mock).mockReturnValue({
        Status: 'SUCCESS',
        Result: { MerchantOrderNo: 'GEO123', TradeNo: 'TN123', PaymentType: 'CREDIT' },
      });
      prisma.order.findUnique.mockResolvedValue({
        merchantOrderNo: 'GEO123', userId, plan: 'PRO', status: 'PENDING',
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
      expect(result).toEqual({ plan: 'PRO', usage: { scansThisMonth: 15, sitesCount: 3 } });
    });

    it('should return undefined plan when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.scan.count.mockResolvedValue(0);
      prisma.site.count.mockResolvedValue(0);

      const result = await service.getSubscription(userId);
      expect(result).toEqual({ plan: undefined, usage: { scansThisMonth: 0, sitesCount: 0 } });
    });
  });
});
