import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from './credit.service';
import { encryptTradeInfo, generateTradeSha, decryptTradeInfo, NewebPayTradeInfo } from './newebpay.util';
import { PlanUsageService } from '../../common/guards/plan.guard';

const PLAN_PRICE: Record<string, number> = {
  STARTER: 390,
  PRO: 690,
};

const PLAN_DESC: Record<string, string> = {
  STARTER: 'Geovault Starter 方案',
  PRO: 'Geovault Pro 方案',
};

const CREDIT_PACKAGES: Record<number, number> = {
  50: 250,   // 50 點 = NT$250
  100: 500,  // 100 點 = NT$500
  200: 1000, // 200 點 = NT$1000
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly newebpayApiUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private planUsage: PlanUsageService,
    private creditService: CreditService,
  ) {
    this.merchantId = this.config.get('NEWEBPAY_MERCHANT_ID') || '';
    this.hashKey = this.config.get('NEWEBPAY_HASH_KEY') || '';
    this.hashIV = this.config.get('NEWEBPAY_HASH_IV') || '';
    this.newebpayApiUrl =
      this.config.get('NEWEBPAY_API_URL') || 'https://ccore.newebpay.com/MPG/mpg_gateway';
  }

  private buildMerchantOrderNo(prefix: 'GEO' | 'CRD', userId: string): string {
    const userSuffix = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).padStart(6, '0');
    return `${prefix}${Date.now()}${userSuffix}${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private async failPaidOrder(merchantOrderNo: string, rawResponse: unknown): Promise<void> {
    await this.prisma.order.update({
      where: { merchantOrderNo },
      data: { status: 'FAILED', rawResponse: rawResponse as any },
    });
  }

  private isProduction(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  private getNewebpayApiUrl(): string {
    if (this.isProduction() && !this.config.get('NEWEBPAY_API_URL')) {
      throw new BadRequestException('NEWEBPAY_API_URL must be configured in production');
    }
    return this.newebpayApiUrl;
  }

  private assertPublicCallbackUrl(value: string, name: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException(`${name} must be a valid URL`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`${name} must use HTTP(S)`);
    }

    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]';

    if (this.isProduction() && (parsed.protocol !== 'https:' || isLocal)) {
      throw new BadRequestException(`${name} must be a public HTTPS URL in production`);
    }

    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  }

  private getBillingCallbackUrl(envKey: 'NEWEBPAY_RETURN_URL' | 'NEWEBPAY_NOTIFY_URL', path: string): string {
    const configured = this.config.get<string>(envKey)?.trim();
    if (configured) return this.assertPublicCallbackUrl(configured, envKey);

    const apiBase = this.config.get<string>('API_PUBLIC_URL') || 'http://localhost:4000';
    const url = new URL(path, apiBase);
    return this.assertPublicCallbackUrl(url.toString(), envKey);
  }

  async createOrder(plan: string, userId: string) {
    const price = PLAN_PRICE[plan];
    if (!price) throw new BadRequestException(`無效的方案: ${plan}`);
    const paymentUrl = this.getNewebpayApiUrl();
    const returnUrl = this.getBillingCallbackUrl('NEWEBPAY_RETURN_URL', '/api/billing/return');
    const notifyUrl = this.getBillingCallbackUrl('NEWEBPAY_NOTIFY_URL', '/api/billing/notify');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const merchantOrderNo = this.buildMerchantOrderNo('GEO', userId);

    await this.prisma.order.create({
      data: { merchantOrderNo, userId, plan, amount: price, status: 'PENDING' },
    });

    const tradeInfo: NewebPayTradeInfo = {
      MerchantID: this.merchantId,
      RespondType: 'JSON',
      TimeStamp: timestamp,
      Version: '2.0',
      MerchantOrderNo: merchantOrderNo,
      Amt: price,
      ItemDesc: PLAN_DESC[plan] || plan,
      Email: user?.email,
      ReturnURL: returnUrl,
      NotifyURL: notifyUrl,
      ClientBackURL: `${this.config.get('FRONTEND_URL')}/settings`,
      CREDIT: 1,
    };

    const aesEncrypted = encryptTradeInfo(tradeInfo, this.hashKey, this.hashIV);
    const tradeSha = generateTradeSha(aesEncrypted, this.hashKey, this.hashIV);

    return {
      paymentUrl,
      MerchantID: this.merchantId,
      TradeInfo: aesEncrypted,
      TradeSha: tradeSha,
      Version: '2.0',
    };
  }

  async createCreditOrder(points: number, userId: string) {
    const price = CREDIT_PACKAGES[points];
    if (!price) throw new BadRequestException(`無效的點數包: ${points}。可選: 50, 100, 200`);
    const paymentUrl = this.getNewebpayApiUrl();
    const returnUrl = this.getBillingCallbackUrl('NEWEBPAY_RETURN_URL', '/api/billing/return');
    const notifyUrl = this.getBillingCallbackUrl('NEWEBPAY_NOTIFY_URL', '/api/billing/notify');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const merchantOrderNo = this.buildMerchantOrderNo('CRD', userId);

    await this.prisma.order.create({
      data: { merchantOrderNo, userId, plan: `CREDITS_${points}`, amount: price, status: 'PENDING' },
    });

    const tradeInfo: NewebPayTradeInfo = {
      MerchantID: this.merchantId,
      RespondType: 'JSON',
      TimeStamp: timestamp,
      Version: '2.0',
      MerchantOrderNo: merchantOrderNo,
      Amt: price,
      ItemDesc: `Geovault 點數充值 ${points} 點`,
      Email: user?.email,
      ReturnURL: returnUrl,
      NotifyURL: notifyUrl,
      ClientBackURL: `${this.config.get('FRONTEND_URL')}/settings`,
      CREDIT: 1,
    };

    const aesEncrypted = encryptTradeInfo(tradeInfo, this.hashKey, this.hashIV);
    const tradeSha = generateTradeSha(aesEncrypted, this.hashKey, this.hashIV);

    return {
      paymentUrl,
      MerchantID: this.merchantId,
      TradeInfo: aesEncrypted,
      TradeSha: tradeSha,
      Version: '2.0',
    };
  }

  async handleNotify(tradeInfoEncrypted: string, tradeSha: string) {
    const expectedSha = generateTradeSha(tradeInfoEncrypted, this.hashKey, this.hashIV);
    if (expectedSha !== tradeSha) {
      this.logger.warn('NotifyURL TradeSha 驗證失敗');
      throw new BadRequestException('TradeSha 驗證失敗');
    }

    const decrypted = decryptTradeInfo(tradeInfoEncrypted, this.hashKey, this.hashIV);
    this.logger.log(`藍新回調: ${JSON.stringify(decrypted)}`);

    const result = decrypted.Result;
    const merchantOrderNo = result.MerchantOrderNo;

    const order = await this.prisma.order.findUnique({ where: { merchantOrderNo } });
    if (!order) throw new BadRequestException('訂單不存在');
    if (order.status === 'PAID') return { message: 'OK' };

    if (decrypted.Status === 'SUCCESS') {
      const paidAmount = Number(result.Amt);
      if (!Number.isFinite(paidAmount) || paidAmount !== order.amount) {
        this.logger.warn(
          `Payment amount mismatch for ${merchantOrderNo}: expected ${order.amount}, got ${result.Amt}`,
        );
        await this.failPaidOrder(merchantOrderNo, decrypted);
        throw new BadRequestException('Payment amount mismatch');
      }

      if (order.plan.startsWith('CREDITS_')) {
        const points = Number(order.plan.replace('CREDITS_', ''));
        if (!Number.isInteger(points) || CREDIT_PACKAGES[points] !== order.amount) {
          this.logger.warn(`Invalid credit package order ${merchantOrderNo}: ${order.plan}/${order.amount}`);
          await this.failPaidOrder(merchantOrderNo, decrypted);
          throw new BadRequestException('Invalid credit package order');
        }
      } else if (PLAN_PRICE[order.plan] !== order.amount) {
        this.logger.warn(`Invalid plan order ${merchantOrderNo}: ${order.plan}/${order.amount}`);
        await this.failPaidOrder(merchantOrderNo, decrypted);
        throw new BadRequestException('Invalid plan order');
      }

      await this.prisma.order.update({
        where: { merchantOrderNo },
        data: {
          status: 'PAID',
          tradeNo: result.TradeNo,
          paymentType: result.PaymentType,
          paidAt: new Date(),
          rawResponse: decrypted,
        },
      });

      if (order.plan.startsWith('CREDITS_')) {
        // Credit top-up order
        const points = parseInt(order.plan.replace('CREDITS_', ''), 10);
        await this.creditService.addCredits(order.userId, points, order.id);
        this.logger.log(`用戶 ${order.userId} 充值 ${points} 點`);
      } else {
        // Plan upgrade order
        await this.prisma.user.update({
          where: { id: order.userId },
          data: { plan: order.plan as any },
        });
        this.logger.log(`用戶 ${order.userId} 升級為 ${order.plan}`);
      }
    } else {
      await this.prisma.order.update({
        where: { merchantOrderNo },
        data: { status: 'FAILED', rawResponse: decrypted },
      });
    }

    return { message: 'OK' };
  }

  async handleReturn(tradeInfoEncrypted: string, tradeSha: string) {
    const expectedSha = generateTradeSha(tradeInfoEncrypted, this.hashKey, this.hashIV);
    if (expectedSha !== tradeSha) {
      return { success: false, message: '驗證失敗' };
    }

    const decrypted = decryptTradeInfo(tradeInfoEncrypted, this.hashKey, this.hashIV);
    return {
      success: decrypted.Status === 'SUCCESS',
      message: decrypted.Status === 'SUCCESS' ? '付款成功' : '付款失敗',
      orderNo: decrypted.Result?.MerchantOrderNo,
    };
  }

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const usage = await this.planUsage.getUsageSummary(userId, user.plan);

    return {
      plan: user.plan,
      role: user.role,
      usage,
    };
  }
}
