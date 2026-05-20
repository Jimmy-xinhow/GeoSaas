import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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
  private readonly allowedPlatforms = new Set([
    'medium',
    'linkedin',
    'wordpress',
    'vocus',
    'facebook',
    'google_business',
  ]);
  private readonly platformRequirements: Record<string, { name: string; required: string[] }> = {
    medium: { name: 'Medium', required: ['MEDIUM_ACCESS_TOKEN'] },
    linkedin: { name: 'LinkedIn', required: ['LINKEDIN_ACCESS_TOKEN'] },
    wordpress: {
      name: 'WordPress',
      required: ['WORDPRESS_SITE_URL', 'WORDPRESS_USERNAME', 'WORDPRESS_APP_PASSWORD'],
    },
    vocus: { name: '方格子', required: ['VOCUS_ACCESS_TOKEN'] },
    facebook: { name: 'Facebook', required: ['FACEBOOK_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'] },
    google_business: {
      name: 'Google 商家檔案',
      required: ['GOOGLE_BUSINESS_TOKEN', 'GOOGLE_BUSINESS_ACCOUNT_ID', 'GOOGLE_BUSINESS_LOCATION_ID'],
    },
  };

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
    const normalizedPlatforms = this.normalizePlatforms(platforms);
    const content = await this.prisma.content.findFirst({ where: { id: contentId, userId } });
    if (!content) throw new NotFoundException('Content not found');

    // Check plan limit: multiPlatform (publishing to multiple platforms)
    if (normalizedPlatforms.length > 1) {
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
      normalizedPlatforms.map((platform) =>
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

  private normalizePlatforms(platforms: unknown): string[] {
    if (!Array.isArray(platforms)) {
      throw new BadRequestException('Platforms must be a non-empty array');
    }

    const normalized = platforms
      .filter((platform): platform is string => typeof platform === 'string')
      .map((platform) => platform.trim().toLowerCase())
      .filter(Boolean);

    if (normalized.length === 0) {
      throw new BadRequestException('At least one platform is required');
    }

    const invalid = normalized.filter(
      (platform) => !this.allowedPlatforms.has(platform),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid platform: ${invalid.join(', ')}`);
    }

    const unavailable = normalized
      .map((platform) => this.getPlatformStatus(platform))
      .filter((status) => !status.configured);
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `以下平台尚未完成串接，不能直接發布：${unavailable
          .map((item) => `${item.name}（缺少 ${item.missingEnv.join(', ')}）`)
          .join('、')}`,
      );
    }

    return [...new Set(normalized)];
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

  getPlatformStatuses() {
    return [...this.allowedPlatforms].map((platform) => this.getPlatformStatus(platform));
  }

  private getPlatformStatus(platform: string) {
    const meta = this.platformRequirements[platform];
    const missingEnv = meta.required.filter((key) => !this.config.get<string>(key));
    return {
      key: platform,
      name: meta.name,
      configured: missingEnv.length === 0,
      missingEnv,
    };
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
