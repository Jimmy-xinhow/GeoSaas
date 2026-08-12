jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { BadRequestException } from '@nestjs/common';
import { CrawlerTrackingService } from './crawler-tracking.service';

describe('CrawlerTrackingService crawler evidence', () => {
  const site = {
    id: 'site-1',
    url: 'https://example.com',
  };

  function service() {
    const prisma = {
      site: { findUnique: jest.fn().mockResolvedValue(site) },
      crawlerVisit: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'visit-1' }),
      },
    };
    return {
      prisma,
      value: new CrawlerTrackingService(prisma as any, {} as any, {} as any),
    };
  }

  it('stores a token-bound matching User-Agent report as ua_only evidence', async () => {
    const { prisma, value } = service();

    await expect(value.reportVisit({
      token: 'abcdefghijklmnop',
      botName: 'GPTBot',
      url: 'https://example.com/services',
      userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      statusCode: 200,
    })).resolves.toEqual({ ok: true });

    expect(prisma.crawlerVisit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'javascript',
        verificationStatus: 'ua_only',
        verificationMethod: 'user_agent',
      }),
    });
  });

  it('rejects a claimed bot that does not match the supplied User-Agent', async () => {
    const { prisma, value } = service();

    await expect(value.reportVisit({
      token: 'abcdefghijklmnop',
      botName: 'ClaudeBot',
      url: 'https://example.com/services',
      userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      statusCode: 200,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.crawlerVisit.create).not.toHaveBeenCalled();
  });

  it('drops a pixel request that cannot be bound to the tracked site', async () => {
    const { prisma, value } = service();

    await value.reportPixelVisit({
      token: 'abcdefghijklmnop',
      url: '',
      userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    });

    expect(prisma.crawlerVisit.create).not.toHaveBeenCalled();
  });

  it('stores a site-bound pixel request as ua_only evidence', async () => {
    const { prisma, value } = service();

    await value.reportPixelVisit({
      token: 'abcdefghijklmnop',
      url: 'https://example.com/faq',
      userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    });

    expect(prisma.crawlerVisit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'pixel',
        verificationStatus: 'ua_only',
        verificationMethod: 'user_agent_and_site_referer',
        url: 'https://example.com/faq',
      }),
    });
  });
});
