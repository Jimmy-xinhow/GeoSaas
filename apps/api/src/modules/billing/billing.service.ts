import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.stripe = new Stripe(this.config.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-06-20' as any });
  }

  async createCheckout(plan: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const priceMap: Record<string, string> = {
      STARTER: 'price_starter_id',
      PRO: 'price_pro_id',
      ENTERPRISE: 'price_enterprise_id',
    };

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user?.email,
      line_items: [{ price: priceMap[plan], quantity: 1 }],
      success_url: `${this.config.get('FRONTEND_URL')}/settings/billing?success=true`,
      cancel_url: `${this.config.get('FRONTEND_URL')}/settings/billing?canceled=true`,
      metadata: { userId },
    });

    return { url: session.url };
  }

  async handleWebhook(body: Buffer, signature: string) {
    const event = this.stripe.webhooks.constructEvent(body, signature, this.config.get('STRIPE_WEBHOOK_SECRET') || '');

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { plan: 'PRO', stripeCustomerId: session.customer as string },
        });
      }
    }
  }

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [scansThisMonth, sitesCount] = await Promise.all([
      this.prisma.scan.count({
        where: {
          site: { userId },
          createdAt: { gte: startOfMonth },
        },
      }),
      this.prisma.site.count({
        where: { userId },
      }),
    ]);

    return {
      plan: user?.plan,
      stripeCustomerId: user?.stripeCustomerId,
      usage: {
        scansThisMonth,
        sitesCount,
      },
    };
  }
}
