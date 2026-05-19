import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from '../../common/guards/plan.guard';
import { siteAccessWhere } from '../../common/auth/site-access';
import { IndexNowService } from '../indexnow/indexnow.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);
  private readonly webUrl = process.env.FRONTEND_URL ?? 'https://www.geovault.app';

  constructor(
    private prisma: PrismaService,
    private planUsage: PlanUsageService,
    private indexNow: IndexNowService,
  ) {}

  async create(dto: CreateSiteDto, userId: string) {
    const url = this.normalizePublicSiteUrl(dto.url);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const check = await this.planUsage.checkAndIncrement(userId, 'maxSites', user.plan, user.role);
    if (!check.allowed) {
      throw new ForbiddenException(
        `已達網站數量上限（${check.used}/${check.limit}）。請升級方案以新增更多網站。`,
      );
    }

    const site = await this.prisma.site.create({
      data: { ...dto, url, userId },
    });

    // If the new site is public, AI crawlers should learn about it fast:
    // ping the new directory page + the platform-wide feeds that list it.
    if (site.isPublic) {
      this.pingDirectoryUrls(site.id);
    }

    return site;
  }

  private pingDirectoryUrls(siteId: string): void {
    const urls = [
      `${this.webUrl}/directory/${siteId}`,
      `${this.webUrl}/llms-full.txt`,
      `${this.webUrl}/sitemap.xml`,
    ];
    for (const url of urls) {
      this.indexNow
        .submitUrl(url)
        .catch((err) => this.logger.warn(`IndexNow ping failed for ${url}: ${err}`));
    }
  }

  /**
   * findAll — respects role-based data isolation:
   * - USER: own sites only
   * - STAFF: own sites plus client-tagged sites
   * - ADMIN/SUPER_ADMIN: all sites
   */
  async findAll(userId: string, userRole?: string) {
    const where: any = siteAccessWhere(userId, userRole);

    return this.prisma.site.findMany({
      where,
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true, status: true, createdAt: true } },
        _count: { select: { scans: true, monitors: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, userRole?: string) {
    const accessWhere: any = siteAccessWhere(userId, userRole);
    const where: any = Object.keys(accessWhere).length === 0
      ? { id }
      : { id, ...accessWhere };

    const site = await this.prisma.site.findFirst({
      where,
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { scans: true, monitors: true, competitors: true } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async update(id: string, dto: UpdateSiteDto, userId: string, userRole?: string) {
    const before = await this.findOne(id, userId, userRole);
    if (dto.profile && dto.profile.dailyContentPaused === false) {
      await this.assertClientDailyCanBeEnabled(id, dto.profile);
    }
    const data = {
      ...dto,
      ...(dto.url ? { url: this.normalizePublicSiteUrl(dto.url) } : {}),
    };
    const after = await this.prisma.site.update({ where: { id }, data });

    // Ping when a site transitions to public or when a public site's
    // identity-shaping fields (name/url/industry/description) change —
    // those affect how the directory page + llms-full.txt render.
    const becamePublic = !before.isPublic && after.isPublic;
    const publicFieldsChanged =
      after.isPublic &&
      (before.name !== after.name ||
        before.url !== after.url ||
        before.industry !== after.industry);
    if (becamePublic || publicFieldsChanged) {
      this.pingDirectoryUrls(id);
    }

    return after;
  }

  private async assertClientDailyCanBeEnabled(siteId: string, nextProfile: Record<string, any>): Promise<void> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        profile: true,
        llmsTxt: true,
        _count: { select: { qas: true, crawlerVisits: { where: { isSeeded: false } } } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    const existingProfile = site.profile && typeof site.profile === 'object' && !Array.isArray(site.profile)
      ? site.profile as Record<string, any>
      : {};
    const profile = { ...existingProfile, ...nextProfile };
    const enriched = profile._enriched && typeof profile._enriched === 'object' && !Array.isArray(profile._enriched)
      ? profile._enriched as Record<string, any>
      : {};
    const text = (...values: unknown[]) =>
      values.some((value) => typeof value === 'string' && value.trim().length > 0);
    const arrayText = (value: unknown) =>
      Array.isArray(value) && value.some((item) => String(item).trim().length > 0);

    const missing = [
      !text(profile.location, enriched.address) && 'location',
      !text(profile.services, enriched.services) && 'services',
      !text(profile.positioning, profile.uniqueValue, enriched.description, profile.description) && 'positioning',
      !text(profile.contact, profile.contactInfo, enriched.telephone, enriched.email) && 'contact',
      !arrayText(profile.targetAudiences) && !text(profile.targetAudience, profile.audience) && 'targetAudiences',
      !arrayText(profile.notFor) && !arrayText(profile.forbidden) && 'notFor',
      site._count.qas < 6 && 'qaPairs',
    ].filter(Boolean) as string[];

    const confidenceScore = Math.max(0, Math.min(100, Math.round(
      (!missing.includes('location') ? 12 : 0) +
      (!missing.includes('services') ? 18 : 0) +
      (!missing.includes('positioning') ? 14 : 0) +
      (!missing.includes('contact') ? 8 : 0) +
      (!missing.includes('targetAudiences') ? 10 : 0) +
      (!missing.includes('notFor') ? 6 : 0) +
      (site._count.qas >= 6 ? 18 : site._count.qas * 3) +
      (site.llmsTxt ? 6 : 0) +
      (site._count.crawlerVisits > 0 ? 8 : 0)
    )));

    if (missing.length > 0 || confidenceScore < 55) {
      throw new BadRequestException({
        message: 'Cannot enable automatic AI Wiki publishing until required brand facts are complete.',
        code: 'CLIENT_DAILY_NOT_READY',
        missingFacts: missing,
        confidenceScore,
      });
    }
  }

  private normalizePublicSiteUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTP(S) URLs can be used for sites');
    }

    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      this.isPrivateOrReservedIp(hostname)
    ) {
      throw new BadRequestException('Private or local URLs cannot be used for sites');
    }

    return parsed.toString();
  }

  private isPrivateOrReservedIp(hostname: string): boolean {
    const normalized = hostname.replace(/^\[|\]$/g, '');
    const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const parts = ipv4.slice(1).map(Number);
      if (parts.some((part) => part < 0 || part > 255)) return true;
      const [a, b] = parts;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }

    return (
      normalized === '::1' ||
      normalized === '0:0:0:0:0:0:0:1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  async remove(id: string, userId: string, userRole?: string) {
    await this.findOne(id, userId, userRole);
    return this.prisma.site.delete({ where: { id } });
  }

  // ─── Client Tagging (SUPER_ADMIN only) ───

  async toggleClient(siteId: string, isClient: boolean) {
    // When promoting a site to paid client, ensure it has a crawler tracking
    // token so the client can install the snippet immediately. Without this,
    // newly-promoted clients have crawlerToken=null until they (or admin)
    // manually visit the snippet page (lazy generation in
    // crawler-tracking.service#getSnippet). That gap caused 立如 to silently
    // miss tracking for 2.5 months.
    const data: { isClient: boolean; crawlerToken?: string } = { isClient };
    if (isClient) {
      const existing = await this.prisma.site.findUnique({
        where: { id: siteId },
        select: { crawlerToken: true },
      });
      if (!existing?.crawlerToken) {
        const { randomBytes } = await import('crypto');
        data.crawlerToken = randomBytes(24).toString('hex');
      }
    }
    return this.prisma.site.update({
      where: { id: siteId },
      data,
    });
  }

  async getClientSites() {
    return this.prisma.site.findMany({
      where: { isClient: true },
      include: {
        user: { select: { id: true, email: true, name: true } },
        scans: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true, status: true, createdAt: true } },
        _count: { select: { scans: true, qas: true, monitors: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async setUserManagedBy(userId: string, managedBy: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { managedBy },
    });
  }
}
