import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock the Stripe module before importing BillingService
jest.mock('stripe', () => {
  const mockCheckoutSessionsCreate = jest.fn();
  const mockWebhooksConstructEvent = jest.fn();

  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }));
});

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    scan: { count: jest.Mock };
    site: { count: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let stripeMock: any;

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      scan: { count: jest.fn() },
      site: { count: jest.fn() },
    };
    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return map[key] || '';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);

    // Access the mocked stripe instance
    stripeMock = (service as any).stripe;
  });

  describe('createCheckout', () => {
    it('should create a Stripe checkout session and return the URL', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, email: 'test@test.com' });
      stripeMock.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-123',
      });

      const result = await service.createCheckout('PRO', userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer_email: 'test@test.com',
          line_items: [{ price: 'price_pro_id', quantity: 1 }],
          metadata: { userId },
        }),
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session-123' });
    });

    it('should handle user not found gracefully with undefined email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      stripeMock.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-456',
      });

      const result = await service.createCheckout('STARTER', userId);

      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: undefined,
          line_items: [{ price: 'price_starter_id', quantity: 1 }],
        }),
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session-456' });
    });
  });

  describe('handleWebhook', () => {
    it('should update user plan when checkout.session.completed event is received', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId },
            customer: 'cus_123',
          },
        },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);
      prisma.user.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from('body'), 'sig-header');

      expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
        Buffer.from('body'),
        'sig-header',
        'whsec_test_123',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { plan: 'PRO', stripeCustomerId: 'cus_123' },
      });
    });

    it('should not update user when event type is not checkout.session.completed', async () => {
      const mockEvent = {
        type: 'invoice.payment_succeeded',
        data: { object: {} },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should not update user when metadata has no userId', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: {},
            customer: 'cus_999',
          },
        },
      };
      stripeMock.webhooks.constructEvent.mockReturnValue(mockEvent);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    it('should return the user plan with usage data', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        plan: 'PRO',
        stripeCustomerId: 'cus_123',
      });
      prisma.scan.count.mockResolvedValue(15);
      prisma.site.count.mockResolvedValue(3);

      const result = await service.getSubscription(userId);

      expect(result).toEqual({
        plan: 'PRO',
        stripeCustomerId: 'cus_123',
        usage: {
          scansThisMonth: 15,
          sitesCount: 3,
        },
      });
    });

    it('should return undefined plan when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.scan.count.mockResolvedValue(0);
      prisma.site.count.mockResolvedValue(0);

      const result = await service.getSubscription(userId);

      expect(result).toEqual({
        plan: undefined,
        stripeCustomerId: undefined,
        usage: {
          scansThisMonth: 0,
          sitesCount: 0,
        },
      });
    });
  });
});
