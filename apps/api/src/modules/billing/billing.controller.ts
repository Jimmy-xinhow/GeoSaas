import { Controller, Get, Post, Body, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Request } from 'express';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @ApiBearerAuth()
  @Post('checkout')
  createCheckout(@Body('plan') plan: string, @CurrentUser('userId') userId: string) {
    return this.billingService.createCheckout(plan, userId);
  }

  @Public()
  @Post('webhook')
  handleWebhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    return this.billingService.handleWebhook(req.body, signature);
  }

  @ApiBearerAuth()
  @Get('subscription')
  getSubscription(@CurrentUser('userId') userId: string) {
    return this.billingService.getSubscription(userId);
  }
}
