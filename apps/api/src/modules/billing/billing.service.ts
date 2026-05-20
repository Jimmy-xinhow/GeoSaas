import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditService } from './credit.service';
import {
  encryptTradeInfo,
  generateTradeSha,
  decryptTradeInfo,
  NewebPayPeriodAlterStatusInfo,
  NewebPayPeriodInfo,
  NewebPayTradeInfo,
} from './newebpay.util';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { AffiliateService } from '../affiliate/affiliate.service';
import {
  CreateManagedCheckoutDto,
  ManagedRefundRequestDto,
} from './dto/create-checkout.dto';

type BillingCycle = 'monthly' | 'yearly';

const PLAN_MONTHLY_PRICE: Record<string, number> = {
  STARTER: 690,
  PRO: 1090,
};

const PLAN_YEARLY_MONTHLY_PRICE: Record<string, number> = {
  STARTER: 621,
  PRO: 981,
};

const PLAN_DESC: Record<string, string> = {
  STARTER: 'Geovault Starter 方案',
  PRO: 'Geovault Pro 方案',
};

const MANAGED_PLAN_MONTHLY_PRICE: Record<string, number> = {
  MANAGED_BASIC: 7800,
  MANAGED_PRO: 15000,
};

const MANAGED_PLAN_YEARLY_MONTHLY_PRICE: Record<string, number> = {
  MANAGED_BASIC: 7020,
  MANAGED_PRO: 13500,
};

const MANAGED_PLAN_DESC: Record<string, string> = {
  MANAGED_BASIC: 'GEOvault Managed Basic 代營運方案',
  MANAGED_PRO: 'GEOvault Managed Pro 代營運方案',
};

const MANAGED_TERMS_VERSION = 'managed-service-2026-05-19';

const CREDIT_PACKAGES: Record<number, number> = {
  50: 250,   // 50 點 = NT$250
  100: 500,  // 100 點 = NT$500
  200: 1000, // 200 點 = NT$1000
};

const RECURRING_PLAN_KEYS = [
  ...Object.keys(PLAN_MONTHLY_PRICE),
  ...Object.keys(MANAGED_PLAN_MONTHLY_PRICE),
];

function normalizeBillingCycle(value?: string): BillingCycle {
  return value === 'yearly' ? 'yearly' : 'monthly';
}

function getPeriodTimes(billingCycle: BillingCycle): string {
  return billingCycle === 'yearly' ? '4' : '48';
}

function getPeriodPoint(billingCycle: BillingCycle, date = new Date()): string {
  const safeDay = String(Math.min(date.getDate(), 28)).padStart(2, '0');
  if (billingCycle === 'yearly') {
    return `${String(date.getMonth() + 1).padStart(2, '0')}${safeDay}`;
  }
  return safeDay;
}

function getPlanAmount(plan: string, billingCycle: BillingCycle): number | undefined {
  if (billingCycle === 'yearly') return PLAN_YEARLY_MONTHLY_PRICE[plan] ? PLAN_YEARLY_MONTHLY_PRICE[plan] * 12 : undefined;
  return PLAN_MONTHLY_PRICE[plan];
}

function isValidPlanAmount(plan: string, amount: number): boolean {
  return [getPlanAmount(plan, 'monthly'), getPlanAmount(plan, 'yearly')].includes(amount);
}

function getManagedPlanAmount(plan: string, billingCycle: BillingCycle): number | undefined {
  if (billingCycle === 'yearly') {
    return MANAGED_PLAN_YEARLY_MONTHLY_PRICE[plan] ? MANAGED_PLAN_YEARLY_MONTHLY_PRICE[plan] * 12 : undefined;
  }
  return MANAGED_PLAN_MONTHLY_PRICE[plan];
}

function isValidManagedPlanAmount(plan: string, amount: number): boolean {
  return [getManagedPlanAmount(plan, 'monthly'), getManagedPlanAmount(plan, 'yearly')].includes(amount);
}

function isSelfServicePlan(plan: string): boolean {
  return Boolean(PLAN_MONTHLY_PRICE[plan]);
}

function isManagedPlan(plan: string): boolean {
  return Boolean(MANAGED_PLAN_MONTHLY_PRICE[plan]);
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTerminatedRawResponse(rawResponse: unknown): boolean {
  if (!isPlainRecord(rawResponse)) return false;
  return rawResponse.subscriptionStatus === 'terminated' || rawResponse.periodStatus === 'terminated';
}

function getBillingCycleFromAmount(plan: string, amount: number): BillingCycle {
  return amount === getPlanAmount(plan, 'yearly') || amount === getManagedPlanAmount(plan, 'yearly')
    ? 'yearly'
    : 'monthly';
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly newebpayApiUrl: string;
  private readonly newebpayPeriodApiUrl: string;
  private readonly newebpayPeriodAlterStatusApiUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private planUsage: PlanUsageService,
    private creditService: CreditService,
    private affiliateService: AffiliateService,
  ) {
    const gatewayMode = (this.config.get('NEWEBPAY_MODE') || '').toLowerCase();
    const useProductionGateway = gatewayMode === 'production' || this.config.get('NODE_ENV') === 'production';
    this.merchantId = this.config.get('NEWEBPAY_MERCHANT_ID') || '';
    this.hashKey = this.config.get('NEWEBPAY_HASH_KEY') || '';
    this.hashIV = this.config.get('NEWEBPAY_HASH_IV') || '';
    this.newebpayApiUrl =
      this.config.get('NEWEBPAY_API_URL') ||
      (useProductionGateway
        ? 'https://core.newebpay.com/MPG/mpg_gateway'
        : 'https://ccore.newebpay.com/MPG/mpg_gateway');
    this.newebpayPeriodApiUrl =
      this.config.get('NEWEBPAY_PERIOD_API_URL') ||
      (useProductionGateway
        ? 'https://core.newebpay.com/MPG/period'
        : 'https://ccore.newebpay.com/MPG/period');
    this.newebpayPeriodAlterStatusApiUrl =
      this.config.get('NEWEBPAY_PERIOD_ALTER_STATUS_API_URL') ||
      `${this.newebpayPeriodApiUrl.replace(/\/$/, '')}/AlterStatus`;
  }

  private buildMerchantOrderNo(prefix: 'GEO' | 'CRD' | 'MNG', userId: string): string {
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

  private getNewebpayPeriodApiUrl(): string {
    return this.newebpayPeriodApiUrl;
  }

  private getNewebpayPeriodAlterStatusApiUrl(): string {
    return this.newebpayPeriodAlterStatusApiUrl;
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

  private getPeriodCallbackUrl(envKey: 'NEWEBPAY_PERIOD_RETURN_URL' | 'NEWEBPAY_PERIOD_NOTIFY_URL', path: string): string {
    const configured = this.config.get<string>(envKey)?.trim();
    if (configured) return this.assertPublicCallbackUrl(configured, envKey);

    const apiBase = this.config.get<string>('API_PUBLIC_URL') || 'http://localhost:4000';
    const url = new URL(path, apiBase);
    return this.assertPublicCallbackUrl(url.toString(), envKey);
  }

  async createOrder(plan: string, userId: string, billingCycleInput?: BillingCycle) {
    const billingCycle = normalizeBillingCycle(billingCycleInput);
    const price = getPlanAmount(plan, billingCycle);
    if (!price) throw new BadRequestException(`無效的方案: ${plan}`);
    const paymentUrl = this.getNewebpayPeriodApiUrl();
    const returnUrl = this.getPeriodCallbackUrl('NEWEBPAY_PERIOD_RETURN_URL', '/api/billing/period/return');
    const notifyUrl = this.getPeriodCallbackUrl('NEWEBPAY_PERIOD_NOTIFY_URL', '/api/billing/period/notify');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const merchantOrderNo = this.buildMerchantOrderNo('GEO', userId);

    await this.prisma.order.create({
      data: {
        merchantOrderNo,
        userId,
        plan,
        amount: price,
        status: 'PENDING',
        rawResponse: {
          type: 'self_service_subscription',
          billingCycle,
          periodTimes: getPeriodTimes(billingCycle),
        },
      },
    });

    const periodInfo: NewebPayPeriodInfo = {
      RespondType: 'JSON',
      TimeStamp: timestamp,
      Version: '1.5',
      LangType: 'zh-Tw',
      MerOrderNo: merchantOrderNo,
      ProdDesc: `${PLAN_DESC[plan] || plan}${billingCycle === 'yearly' ? ' 年繳訂閱' : ' 月繳訂閱'}`,
      PeriodAmt: price,
      PeriodType: billingCycle === 'yearly' ? 'Y' : 'M',
      PeriodPoint: getPeriodPoint(billingCycle),
      PeriodStartType: '2',
      PeriodTimes: getPeriodTimes(billingCycle),
      PayerEmail: user?.email,
      PaymentInfo: 'Y',
      OrderInfo: 'N',
      EmailModify: '1',
      ReturnURL: returnUrl,
      NotifyURL: notifyUrl,
      BackURL: `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/settings`,
      PeriodMemo: `${PLAN_DESC[plan] || plan} ${billingCycle} subscription`,
    };

    const postData = encryptTradeInfo(periodInfo, this.hashKey, this.hashIV);

    return {
      paymentUrl,
      MerchantID_: this.merchantId,
      PostData_: postData,
      paymentType: 'PERIOD',
    };
  }

  async createManagedOrder(dto: CreateManagedCheckoutDto, userId: string) {
    const billingCycle = normalizeBillingCycle(dto.billingCycle);
    const price = getManagedPlanAmount(dto.plan, billingCycle);
    if (!price) throw new BadRequestException(`無效的代營運方案: ${dto.plan}`);
    if (!dto.acceptedTerms || dto.termsVersion !== MANAGED_TERMS_VERSION) {
      throw new BadRequestException('請先確認並同意代營運合約與退費審核條款');
    }

    const paymentUrl = this.getNewebpayPeriodApiUrl();
    const returnUrl = this.getPeriodCallbackUrl('NEWEBPAY_PERIOD_RETURN_URL', '/api/billing/period/return');
    const notifyUrl = this.getPeriodCallbackUrl('NEWEBPAY_PERIOD_NOTIFY_URL', '/api/billing/period/notify');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const merchantOrderNo = this.buildMerchantOrderNo('MNG', userId);

    await this.prisma.order.create({
      data: {
        merchantOrderNo,
        userId,
        plan: dto.plan,
        amount: price,
        status: 'PENDING',
        rawResponse: {
          type: 'managed_service',
          billingCycle,
          termsVersion: dto.termsVersion,
          acceptedTermsAt: new Date().toISOString(),
        },
      },
    });

    const periodInfo: NewebPayPeriodInfo = {
      RespondType: 'JSON',
      TimeStamp: timestamp,
      Version: '1.5',
      LangType: 'zh-Tw',
      MerOrderNo: merchantOrderNo,
      ProdDesc: `${MANAGED_PLAN_DESC[dto.plan] || dto.plan}${billingCycle === 'yearly' ? ' 年繳' : ' 月繳'}`,
      PeriodAmt: price,
      PeriodType: billingCycle === 'yearly' ? 'Y' : 'M',
      PeriodPoint: getPeriodPoint(billingCycle),
      PeriodStartType: '2',
      PeriodTimes: getPeriodTimes(billingCycle),
      PayerEmail: user?.email,
      PaymentInfo: 'Y',
      OrderInfo: 'N',
      EmailModify: '1',
      ReturnURL: returnUrl,
      NotifyURL: notifyUrl,
      BackURL: `${this.config.get('FRONTEND_URL') || 'http://localhost:3001'}/#managed-service`,
      PeriodMemo: `${MANAGED_PLAN_DESC[dto.plan]} ${billingCycle} subscription`,
    };

    const postData = encryptTradeInfo(periodInfo, this.hashKey, this.hashIV);

    return {
      paymentUrl,
      MerchantID_: this.merchantId,
      PostData_: postData,
      paymentType: 'PERIOD',
    };
  }

  async handlePeriodNotify(periodEncrypted: string) {
    if (!periodEncrypted) throw new BadRequestException('Period payload is required');
    const decrypted = decryptTradeInfo(periodEncrypted, this.hashKey, this.hashIV);
    this.logger.log(`藍新定期定額回調: ${JSON.stringify(decrypted)}`);

    const result = decrypted.Result;
    const merchantOrderNo = result?.MerchantOrderNo || result?.MerOrderNo;
    if (!merchantOrderNo) throw new BadRequestException('Missing period order number');

    const order = await this.prisma.order.findUnique({ where: { merchantOrderNo } });
    if (!order) throw new BadRequestException('訂單不存在');
    if (order.status === 'PAID') return { message: 'OK' };

    if (decrypted.Status === 'SUCCESS') {
      const paidAmount = Number(result.PeriodAmt ?? result.Amt ?? order.amount);
      const isValidSelfService = isSelfServicePlan(order.plan) && isValidPlanAmount(order.plan, order.amount);
      const isValidManagedService = isManagedPlan(order.plan) && isValidManagedPlanAmount(order.plan, order.amount);

      if (!Number.isFinite(paidAmount) || paidAmount !== order.amount || (!isValidSelfService && !isValidManagedService)) {
        await this.failPaidOrder(merchantOrderNo, decrypted);
        throw new BadRequestException('Invalid period subscription order');
      }

      await this.prisma.order.update({
        where: { merchantOrderNo },
        data: {
          status: 'PAID',
          tradeNo: result.TradeNo || result.PeriodNo,
          paymentType: 'PERIOD',
          paidAt: new Date(),
          rawResponse: decrypted,
        },
      });

      if (isValidManagedService) {
        await this.prisma.notification.create({
          data: {
            userId: order.userId,
            type: 'managed_service_paid',
            title: '代營運訂閱付款成功',
            message: `${MANAGED_PLAN_DESC[order.plan]} 已建立定期定額付款。訂單編號：${merchantOrderNo}`,
          },
        });
      } else {
        await this.prisma.user.update({
          where: { id: order.userId },
          data: { plan: order.plan as any },
        });
        await this.prisma.notification.create({
          data: {
            userId: order.userId,
            type: 'subscription_paid',
            title: '訂閱方案付款成功',
            message: `${PLAN_DESC[order.plan]} 已建立定期定額付款。訂單編號：${merchantOrderNo}`,
          },
        });
      }
      if (!order.plan.startsWith('CREDITS_')) {
        await this.affiliateService.calculateCommission(order.id).catch((error) => {
          this.logger.warn(`Affiliate commission skipped for ${merchantOrderNo}: ${error?.message ?? error}`);
        });
      }
    } else {
      await this.prisma.order.update({
        where: { merchantOrderNo },
        data: { status: 'FAILED', rawResponse: decrypted },
      });
    }

    return { message: 'OK' };
  }

  async handlePeriodReturn(periodEncrypted: string) {
    if (!periodEncrypted) return { success: false, message: '缺少定期定額回傳資料' };
    const decrypted = decryptTradeInfo(periodEncrypted, this.hashKey, this.hashIV);
    return {
      success: decrypted.Status === 'SUCCESS',
      message: decrypted.Status === 'SUCCESS' ? '定期定額付款建立成功' : '定期定額付款建立失敗',
      orderNo: decrypted.Result?.MerchantOrderNo || decrypted.Result?.MerOrderNo,
    };
  }

  async submitManagedRefundRequest(dto: ManagedRefundRequestDto, userId: string) {
    if (!dto.acceptedReviewTerms) {
      throw new BadRequestException('請先確認退費或延長補強審核條件');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        merchantOrderNo: dto.orderNo,
        plan: dto.plan,
        status: 'PAID',
      },
      select: {
        id: true,
        merchantOrderNo: true,
        plan: true,
        amount: true,
        paidAt: true,
        rawResponse: true,
      },
    });

    if (!order || !MANAGED_PLAN_MONTHLY_PRICE[order.plan]) {
      throw new BadRequestException('找不到符合條件的已付款代營運訂單');
    }

    const resolutionLabel = dto.requestedResolution === 'refund' ? '退費審核' : '延長補強';
    const requestId = `MSR-${Date.now()}`;
    const message = [
      `申請編號：${requestId}`,
      `訂單編號：${order.merchantOrderNo}`,
      `方案：${MANAGED_PLAN_DESC[order.plan]}`,
      `申請項目：${resolutionLabel}`,
      `申請依據：${dto.basis}`,
      '審核條件：以事前約定問題庫、AI 平台範圍、檢測期間與可見度指標為準；不以成交數、詢問數、流量數、單一平台、單一問題或單次回答作為依據。',
    ].join('\n');

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'managed_refund_request',
        title: `代營運${resolutionLabel}申請已送出`,
        message,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });

    if (admins.length > 0) {
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'managed_refund_request',
          title: `新的代營運${resolutionLabel}申請`,
          message,
        })),
      });
    }

    return {
      requestId,
      message: '申請已送出，系統會依約定問題庫、平台範圍、檢測期間與可見度指標審核。',
    };
  }

  private parseNewebPayAlterStatusResponse(text: string): any {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.PostData_) {
        return decryptTradeInfo(parsed.PostData_, this.hashKey, this.hashIV);
      }
      return parsed;
    } catch {
      const params = new URLSearchParams(text);
      const postData = params.get('PostData_') || params.get('PostData');
      if (postData) return decryptTradeInfo(postData, this.hashKey, this.hashIV);
      return Object.fromEntries(params.entries());
    }
  }

  private async terminateNewebPayPeriodSubscription(order: {
    merchantOrderNo: string;
    tradeNo: string | null;
  }): Promise<any> {
    if (!order.tradeNo) {
      throw new BadRequestException('此訂單尚未取得藍新定期定額委託單號，無法線上終止扣款');
    }

    const payload: NewebPayPeriodAlterStatusInfo = {
      RespondType: 'JSON',
      Version: '1.0',
      MerOrderNo: order.merchantOrderNo,
      PeriodNo: order.tradeNo,
      AlterType: 'terminate',
    };
    const postData = encryptTradeInfo(payload, this.hashKey, this.hashIV);
    const body = new URLSearchParams({
      MerchantID_: this.merchantId,
      PostData_: postData,
    });

    const response = await fetch(this.getNewebpayPeriodAlterStatusApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await response.text();
    const result = this.parseNewebPayAlterStatusResponse(text);

    if (!response.ok || result?.Status !== 'SUCCESS') {
      this.logger.warn(`NewebPay period terminate failed for ${order.merchantOrderNo}: ${text}`);
      throw new BadRequestException(
        result?.Message ||
        result?.message ||
        '藍新定期定額終止失敗，請確認商店已開通修改委託狀態 API 後再試',
      );
    }

    return result;
  }

  async cancelSubscription(orderNo: string, userId: string, acceptedTerminationNotice: boolean) {
    if (!acceptedTerminationNotice) {
      throw new BadRequestException('請先確認四年期數與可隨時終止扣款說明');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        merchantOrderNo: orderNo,
        status: 'PAID',
        plan: { in: RECURRING_PLAN_KEYS },
      },
      select: {
        id: true,
        merchantOrderNo: true,
        tradeNo: true,
        plan: true,
        amount: true,
        rawResponse: true,
      },
    });

    if (!order) throw new BadRequestException('找不到可終止的定期定額訂單');
    if (isTerminatedRawResponse(order.rawResponse)) {
      return { message: '此訂閱已終止，不會再繼續扣款' };
    }

    const result = await this.terminateNewebPayPeriodSubscription(order);
    const rawResponse = isPlainRecord(order.rawResponse) ? order.rawResponse : {};
    const terminatedAt = new Date().toISOString();

    await this.prisma.order.update({
      where: { merchantOrderNo: order.merchantOrderNo },
      data: {
        rawResponse: {
          ...rawResponse,
          subscriptionStatus: 'terminated',
          terminatedAt,
          terminateResponse: result,
        },
      },
    });

    if (isSelfServicePlan(order.plan)) {
      const paidSelfOrders = await this.prisma.order.findMany({
        where: {
          userId,
          status: 'PAID',
          plan: { in: Object.keys(PLAN_MONTHLY_PRICE) },
          NOT: { merchantOrderNo: order.merchantOrderNo },
        },
        orderBy: { paidAt: 'desc' },
        select: { plan: true, rawResponse: true },
      });
      const nextActivePlan = paidSelfOrders.find((item) => !isTerminatedRawResponse(item.rawResponse))?.plan;
      await this.prisma.user.update({
        where: { id: userId },
        data: { plan: (nextActivePlan || 'FREE') as any },
      });
    }

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'subscription_terminated',
        title: '訂閱扣款已終止',
        message: `${(MANAGED_PLAN_DESC[order.plan] || PLAN_DESC[order.plan] || order.plan)} 已送出藍新終止委託，不會再繼續定期扣款。訂單編號：${order.merchantOrderNo}`,
      },
    });

    return {
      message: '已終止藍新定期定額委託，後續不會再繼續扣款',
      orderNo: order.merchantOrderNo,
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
      } else if (MANAGED_PLAN_MONTHLY_PRICE[order.plan]) {
        if (!isValidManagedPlanAmount(order.plan, order.amount)) {
          this.logger.warn(`Invalid managed order ${merchantOrderNo}: ${order.plan}/${order.amount}`);
          await this.failPaidOrder(merchantOrderNo, decrypted);
          throw new BadRequestException('Invalid managed service order');
        }
      } else if (!isValidPlanAmount(order.plan, order.amount)) {
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
      } else if (MANAGED_PLAN_MONTHLY_PRICE[order.plan]) {
        await this.prisma.notification.create({
          data: {
            userId: order.userId,
            type: 'managed_service_paid',
            title: '代營運方案付款成功',
            message: `${MANAGED_PLAN_DESC[order.plan]} 已付款成功。訂單編號：${merchantOrderNo}`,
          },
        });
        this.logger.log(`用戶 ${order.userId} 購買 ${order.plan}`);
      } else {
        // Plan upgrade order
        await this.prisma.user.update({
          where: { id: order.userId },
          data: { plan: order.plan as any },
        });
        this.logger.log(`用戶 ${order.userId} 升級為 ${order.plan}`);
      }
      if (!order.plan.startsWith('CREDITS_')) {
        await this.affiliateService.calculateCommission(order.id).catch((error) => {
          this.logger.warn(`Affiliate commission skipped for ${merchantOrderNo}: ${error?.message ?? error}`);
        });
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
    const recurringOrders = await this.prisma.order.findMany({
      where: {
        userId,
        status: 'PAID',
        plan: { in: RECURRING_PLAN_KEYS },
      },
      orderBy: { paidAt: 'desc' },
      select: {
        merchantOrderNo: true,
        plan: true,
        amount: true,
        paidAt: true,
        tradeNo: true,
        rawResponse: true,
      },
    });
    const activeRecurringSubscriptions = recurringOrders
      .filter((order) => order.tradeNo && !isTerminatedRawResponse(order.rawResponse))
      .map((order) => {
        const billingCycle = getBillingCycleFromAmount(order.plan, order.amount);
        return {
          orderNo: order.merchantOrderNo,
          plan: order.plan,
          planLabel: MANAGED_PLAN_DESC[order.plan] ?? PLAN_DESC[order.plan] ?? order.plan,
          amount: order.amount,
          paidAt: order.paidAt,
          type: isManagedPlan(order.plan) ? 'managed' : 'self_service',
          billingCycle,
          periodTimes: getPeriodTimes(billingCycle),
          canCancel: true,
        };
      });
    const managedSubscriptions = await this.prisma.order.findMany({
      where: {
        userId,
        status: 'PAID',
        plan: { in: Object.keys(MANAGED_PLAN_MONTHLY_PRICE) },
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

    return {
      plan: user.plan,
      role: user.role,
      usage,
      activeSubscriptions: activeRecurringSubscriptions,
      managedSubscriptions: managedSubscriptions
        .filter((order) => !isTerminatedRawResponse(order.rawResponse))
        .map((order) => ({
          orderNo: order.merchantOrderNo,
          plan: order.plan,
          planLabel: MANAGED_PLAN_DESC[order.plan] ?? order.plan,
          amount: order.amount,
          paidAt: order.paidAt,
        })),
    };
  }
}
