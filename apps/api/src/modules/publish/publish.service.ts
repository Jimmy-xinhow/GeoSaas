import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService, PLAN_LIMITS } from '../../common/guards/plan.guard';
import { ConfigService } from '@nestjs/config';
import { MediumAdapter } from './adapters/medium.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { WordPressAdapter } from './adapters/wordpress.adapter';
import { VocusAdapter } from './adapters/vocus.adapter';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { GoogleBusinessAdapter } from './adapters/google-business.adapter';
import { IPlatformAdapter } from './adapters/adapter.interface';

@Injectable()
export class PublishService {
  private logger = new Logger(PublishService.name);
  private adapterMap: Record<string, IPlatformAdapter>;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private planUsage: PlanUsageService,
    private mediumAdapter: MediumAdapter,
    private linkedInAdapter: LinkedInAdapter,
    private wordPressAdapter: WordPressAdapter,
    private vocusAdapter: VocusAdapter,
    private facebookAdapter: FacebookAdapter,
    private googleBusinessAdapter: GoogleBusinessAdapter,
  ) {
    this.adapterMap = {
      medium: this.mediumAdapter,
      linkedin: this.linkedInAdapter,
      wordpress: this.wordPressAdapter,
      vocus: this.vocusAdapter,
      facebook: this.facebookAdapter,
      google_business: this.googleBusinessAdapter,
    };
  }

  async publish(contentId: string, platforms: string[], userId: string) {
    const content = await this.prisma.content.findFirst({ where: { id: contentId, userId } });
    if (!content) throw new NotFoundException('Content not found');

    // Check plan limit: multiPlatform (publishing to multiple platforms)
    if (platforms.length > 1) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const check = await this.planUsage.checkAndIncrement(userId, 'multiPlatform', user.plan, user.role);
        if (!check.allowed) {
          throw new ForbiddenException(
            '多平台發布功能需要升級至 PRO 方案才能使用。',
          );
        }
      }
    }

    const publications = await Promise.all(
      platforms.map((platform) =>
        this.prisma.publication.create({
          data: { contentId, platform, status: 'PENDING' },
        }),
      ),
    );

    // Trigger actual publishing via platform adapters in the background
    for (const pub of publications) {
      const adapter = this.adapterMap[pub.platform.toLowerCase()];
      if (!adapter) continue;

      this.publishViaAdapter(pub.id, content, adapter).catch((err) =>
        this.logger.error(`Failed to publish ${pub.id} to ${pub.platform}: ${err}`),
      );
    }

    return publications;
  }

  private async publishViaAdapter(publicationId: string, content: { title: string; body: string }, adapter: IPlatformAdapter) {
    try {
      await this.prisma.publication.update({ where: { id: publicationId }, data: { status: 'PUBLISHING' } });

      const platformConfig = this.getPlatformConfig(adapter.platform);
      const result = await adapter.publish(content, platformConfig);

      await this.prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'PUBLISHED', externalUrl: result.externalUrl, publishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Publish adapter error: ${error}`);
      await this.prisma.publication.update({ where: { id: publicationId }, data: { status: 'FAILED' } });
    }
  }

  private getPlatformConfig(platform: string): Record<string, string> {
    switch (platform) {
      case 'medium':
        return { accessToken: this.config.get('MEDIUM_ACCESS_TOKEN') || '' };
      case 'linkedin':
        return { accessToken: this.config.get('LINKEDIN_ACCESS_TOKEN') || '' };
      case 'wordpress':
        return {
          siteUrl: this.config.get('WORDPRESS_SITE_URL') || '',
          username: this.config.get('WORDPRESS_USERNAME') || '',
          appPassword: this.config.get('WORDPRESS_APP_PASSWORD') || '',
        };
      case 'vocus':
        return { accessToken: this.config.get('VOCUS_ACCESS_TOKEN') || '' };
      case 'facebook':
        return {
          accessToken: this.config.get('FACEBOOK_ACCESS_TOKEN') || '',
          pageId: this.config.get('FACEBOOK_PAGE_ID') || '',
        };
      case 'google_business':
        return {
          accessToken: this.config.get('GOOGLE_BUSINESS_TOKEN') || '',
          accountId: this.config.get('GOOGLE_BUSINESS_ACCOUNT_ID') || '',
          locationId: this.config.get('GOOGLE_BUSINESS_LOCATION_ID') || '',
        };
      default:
        return {};
    }
  }

  async findAll(userId: string) {
    const contents = await this.prisma.content.findMany({ where: { userId }, select: { id: true } });
    const contentIds = contents.map((c: any) => c.id);
    return this.prisma.publication.findMany({
      where: { contentId: { in: contentIds } },
      include: { content: { select: { title: true, type: true } } },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
