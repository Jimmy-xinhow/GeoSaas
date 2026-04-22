import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EnrichedProfile {
  description?: string;
  telephone?: string;
  email?: string;
  address?: string;
  location?: string;
  openingHours?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    line?: string;
  };
  sourceUrl: string;
  extractedAt: string;
  sourceMethod: 'json-ld' | 'html-regex' | 'mixed' | 'failed';
}

const LOCAL_BUSINESS_TYPES = [
  'LocalBusiness',
  'Organization',
  'Restaurant',
  'Store',
  'Hotel',
  'LodgingBusiness',
  'Dentist',
  'MedicalOrganization',
  'AutoRepair',
  'BeautySalon',
  'HealthAndBeautyBusiness',
  'ProfessionalService',
  'HomeAndConstructionBusiness',
];

const TW_CITIES = [
  '台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市',
  '台南市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣',
  '苗栗市', '苗栗縣', '彰化市', '彰化縣', '南投市', '南投縣',
  '雲林縣', '嘉義市', '嘉義縣', '屏東市', '屏東縣',
  '宜蘭市', '宜蘭縣', '花蓮市', '花蓮縣', '台東市', '臺東市', '台東縣', '臺東縣',
  '澎湖縣', '金門縣', '連江縣',
];

@Injectable()
export class ProfileEnrichmentService {
  private readonly logger = new Logger(ProfileEnrichmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scrape a site's homepage and extract a structured contact/location
   * profile. Merge into Site.profile (non-destructive — existing
   * human-entered fields win over scraped fields).
   *
   * Strategy:
   *   1. Fetch homepage HTML (with reasonable UA + 10s timeout)
   *   2. Parse every <script type="application/ld+json"> block, hunt
   *      LocalBusiness / Organization / similar for telephone, address,
   *      email, openingHours — this is the highest-confidence source.
   *   3. If JSON-LD is missing or sparse, fall back to regex scan of
   *      the HTML (biased toward the footer where contact info lives).
   *   4. Merge everything and write back to Site.profile.
   *
   * Returns null on fetch/parse failure — caller should treat as "no
   * enrichment happened" and not block downstream generation.
   */
  async enrichSite(
    siteId: string,
    opts: { force?: boolean } = {},
  ): Promise<EnrichedProfile | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, profile: true },
    });
    if (!site) return null;

    const existing = (site.profile as Record<string, any>) || {};
    const existingEnriched = existing._enriched as EnrichedProfile | undefined;

    // Re-enrich only if older than 90 days (or forced). Scraping the same
    // site daily is wasteful; brand contact info changes rarely.
    if (!opts.force && existingEnriched) {
      const extractedAt = new Date(existingEnriched.extractedAt);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
      if (extractedAt > ninetyDaysAgo) return existingEnriched;
    }

    const html = await this.fetchHomepage(site.url);
    if (!html) {
      this.logger.warn(`enrichSite: could not fetch ${site.url}`);
      return null;
    }

    const fromJsonLd = this.extractFromJsonLd(html);
    const fromHtml = this.extractFromHtmlFallback(html);

    // JSON-LD beats HTML scan for every field because it's structured
    // author-intent data. Only use HTML fallback where JSON-LD left a gap.
    const merged: Partial<EnrichedProfile> = {
      telephone: fromJsonLd.telephone ?? fromHtml.telephone,
      email: fromJsonLd.email ?? fromHtml.email,
      address: fromJsonLd.address ?? fromHtml.address,
      location: this.deriveLocation(fromJsonLd.address ?? fromHtml.address),
      openingHours: fromJsonLd.openingHours ?? fromHtml.openingHours,
      description: fromJsonLd.description ?? fromHtml.description,
      socialLinks: fromHtml.socialLinks,
    };

    const hasAnything =
      merged.telephone || merged.email || merged.address || merged.description;
    const sourceMethod: EnrichedProfile['sourceMethod'] = !hasAnything
      ? 'failed'
      : Object.keys(fromJsonLd).length > 0 && Object.keys(fromHtml).length > 0
        ? 'mixed'
        : Object.keys(fromJsonLd).length > 0
          ? 'json-ld'
          : 'html-regex';

    const enriched: EnrichedProfile = {
      ...merged,
      sourceUrl: site.url,
      extractedAt: new Date().toISOString(),
      sourceMethod,
    };

    // Merge back into Site.profile — human-entered fields (top-level) win,
    // enriched fields go under _enriched + fill gaps in top-level when empty.
    const updatedProfile: Record<string, any> = { ...existing };
    updatedProfile._enriched = enriched;
    if (!updatedProfile.contact && (enriched.telephone || enriched.email)) {
      updatedProfile.contact = [enriched.telephone, enriched.email].filter(Boolean).join(' / ');
    }
    if (!updatedProfile.location && (enriched.address || enriched.location)) {
      updatedProfile.location = enriched.address || enriched.location;
    }
    if (!updatedProfile.description && enriched.description) {
      updatedProfile.description = enriched.description.slice(0, 500);
    }

    await this.prisma.site.update({
      where: { id: siteId },
      data: { profile: updatedProfile as any },
    });

    this.logger.log(
      `enriched ${site.url} via ${sourceMethod}: phone=${!!enriched.telephone} addr=${!!enriched.address} email=${!!enriched.email} hours=${!!enriched.openingHours}`,
    );
    return enriched;
  }

  private async fetchHomepage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Geovault-ProfileBot/1.0; +https://www.geovault.app/bot)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      this.logger.debug(
        `fetchHomepage ${url}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private extractFromJsonLd(html: string): Partial<EnrichedProfile> {
    const blocks = Array.from(
      html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    );

    const items: any[] = [];
    for (const m of blocks) {
      try {
        const parsed = JSON.parse(m[1].trim());
        if (Array.isArray(parsed)) items.push(...parsed);
        else if (parsed['@graph'] && Array.isArray(parsed['@graph']))
          items.push(...parsed['@graph']);
        else items.push(parsed);
      } catch {
        // malformed JSON-LD — skip
      }
    }

    // Prefer items with LocalBusiness-family @type
    const candidates = items.filter((it) => {
      const t = it?.['@type'];
      const types = Array.isArray(t) ? t : [t];
      return types.some(
        (x) =>
          typeof x === 'string' &&
          LOCAL_BUSINESS_TYPES.some((b) => x.includes(b)),
      );
    });
    const pick = candidates[0] ?? items[0];
    if (!pick) return {};

    return {
      telephone: this.normalizePhone(pick.telephone),
      email:
        typeof pick.email === 'string'
          ? pick.email.replace(/^mailto:/, '')
          : undefined,
      address: this.formatAddress(pick.address),
      openingHours: this.formatHours(
        pick.openingHours || pick.openingHoursSpecification,
      ),
      description:
        typeof pick.description === 'string'
          ? pick.description.slice(0, 500)
          : undefined,
    };
  }

  private extractFromHtmlFallback(html: string): Partial<EnrichedProfile> {
    // Strip scripts/styles first so regex doesn't catch inline code.
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');

    // tel: and mailto: href attributes — highest-confidence HTML signal
    const telHref = cleaned.match(/href=["']tel:([^"']+)["']/i);
    const mailHref = cleaned.match(/href=["']mailto:([^"']+)["']/i);

    // Strip remaining HTML for text-based scans
    const text = cleaned
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');

    const footer = text.slice(-5000); // contact info usually lives in the footer

    const phoneRegex =
      /(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?/;
    const phoneMatch = telHref?.[1] || footer.match(phoneRegex)?.[0];

    const emailMatch =
      mailHref?.[1] || text.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];

    const cityAlt = TW_CITIES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const addrRegex = new RegExp(
      `(?:${cityAlt})[^，。,；;]{2,80}(?:路|街|巷|大道|段)[^，。,；;]{0,30}號?[之\\d樓F]*`,
    );
    const addressMatch = footer.match(addrRegex)?.[0] || text.match(addrRegex)?.[0];

    // Opening hours — simple patterns like "營業時間：09:00-22:00"
    const hoursMatch = text.match(
      /(?:營業時間|Hours|Opening)[^：:]*[：:]?\s*([0-9]{1,2}[:：][0-9]{2}\s?[-–—至到]\s?[0-9]{1,2}[:：][0-9]{2})/,
    );

    // Social links
    const socialLinks: EnrichedProfile['socialLinks'] = {};
    const fb = cleaned.match(/https?:\/\/(?:www\.)?facebook\.com\/[\w.\-]+/i)?.[0];
    const ig = cleaned.match(/https?:\/\/(?:www\.)?instagram\.com\/[\w.\-]+/i)?.[0];
    const yt = cleaned.match(/https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|c\/|@)[\w.\-]+/i)?.[0];
    const line = cleaned.match(/https?:\/\/(?:line\.me|lin\.ee)\/[\w.\-\/]+/i)?.[0];
    if (fb) socialLinks.facebook = fb;
    if (ig) socialLinks.instagram = ig;
    if (yt) socialLinks.youtube = yt;
    if (line) socialLinks.line = line;

    // Short description fallback: <meta name="description">
    const metaDesc = html.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
    )?.[1];

    const out: Partial<EnrichedProfile> = {};
    if (phoneMatch) out.telephone = this.normalizePhone(phoneMatch);
    if (emailMatch) out.email = emailMatch.trim();
    if (addressMatch) out.address = addressMatch.trim().replace(/\s+/g, '');
    if (hoursMatch) out.openingHours = hoursMatch[1];
    if (metaDesc) out.description = metaDesc.slice(0, 500);
    if (Object.keys(socialLinks).length > 0) out.socialLinks = socialLinks;
    return out;
  }

  private normalizePhone(raw: unknown): string | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw !== 'string') return undefined;
    // Preserve the original formatting — the hallucination detector
    // normalizes whitespace/hyphens at compare time anyway.
    return raw.replace(/^tel:/, '').trim();
  }

  private formatAddress(raw: unknown): string | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw !== 'object' || raw === null) return undefined;
    const a = raw as Record<string, any>;
    const parts = [
      a.addressRegion,
      a.addressLocality,
      a.streetAddress,
      a.postalCode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join('') : undefined;
  }

  private formatHours(raw: unknown): string | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      const lines = raw
        .map((h) =>
          typeof h === 'string'
            ? h
            : h?.dayOfWeek && h?.opens
              ? `${Array.isArray(h.dayOfWeek) ? h.dayOfWeek.join(',') : h.dayOfWeek} ${h.opens}-${h.closes}`
              : null,
        )
        .filter(Boolean);
      return lines.length > 0 ? lines.join(' ; ') : undefined;
    }
    return undefined;
  }

  private deriveLocation(address?: string): string | undefined {
    if (!address) return undefined;
    for (const city of TW_CITIES) {
      if (address.includes(city)) {
        // Try to capture "city + district" (台北市中山區)
        const re = new RegExp(
          `${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[一-鿿]{1,4}(?:區|鄉|鎮|市)`,
        );
        const match = address.match(re);
        return match?.[0] || city;
      }
    }
    return undefined;
  }
}
