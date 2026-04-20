import { Controller, Get, Post, Body, Res, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { CreditService } from './credit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private creditService: CreditService,
  ) {}

  @ApiBearerAuth()
  @Post('checkout')
  createCheckout(@Body('plan') plan: string, @CurrentUser('userId') userId: string) {
    return this.billingService.createOrder(plan, userId);
  }

  @Public()
  @Post('notify')
  @HttpCode(200)
  handleNotify(
    @Body('TradeInfo') tradeInfo: string,
    @Body('TradeSha') tradeSha: string,
  ) {
    return this.billingService.handleNotify(tradeInfo, tradeSha);
  }

  @Public()
  @Post('return')
  @HttpCode(200)
  async handleReturn(
    @Body('TradeInfo') tradeInfo: string,
    @Body('TradeSha') tradeSha: string,
    @Res() res: Response,
  ) {
    const result = await this.billingService.handleReturn(tradeInfo, tradeSha);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const params = new URLSearchParams({
      success: result.success.toString(),
      orderNo: result.orderNo || '',
      message: result.message,
    });
    res.redirect(302, `${frontendUrl}/settings/billing/result?${params.toString()}`);
  }

  @ApiBearerAuth()
  @Get('subscription')
  getSubscription(@CurrentUser('userId') userId: string) {
    return this.billingService.getSubscription(userId);
  }

  @ApiBearerAuth()
  @Post('credits/checkout')
  @ApiOperation({ summary: 'Purchase credit points (50/100/200)' })
  createCreditCheckout(
    @Body('points') points: number,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billingService.createCreditOrder(points, userId);
  }

  @ApiBearerAuth()
  @Get('credits')
  @ApiOperation({ summary: 'Get credit balance and transaction history' })
  getCredits(@CurrentUser('userId') userId: string) {
    return this.creditService.getBalance(userId);
  }
}
