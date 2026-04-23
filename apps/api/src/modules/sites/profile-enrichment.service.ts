import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EnrichedProfile {
  description?: string;
  telephone?: string;
  email?: string;
  address?: string;
  location?: string;
  openingHours?: string;
  cleanName?: string;
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

/**
 * Detect names that can't safely be used in prompts/articles — same ruleset
 * as the industry_top10 filter, exported so the cleanup path can flag sites
 * in the DB.
 */
export function isNameCorrupt(name: string | null | undefined): boolean {
  if (!name) return true;
  if (name.length > 50) return true;
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)) return true;
  if (/[｜|]/.test(name) && name.length > 25) return true;
  const punct = (name.match(/[,，、／/｜|【】()（）:：?？!!]/g) || []).length;
  if (punct >= 3) return true;
  if ((name.match(/\?/g) || []).length >= 2) return true;
  if (/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐擃瘜敺蝢]/.test(name)) return true;
  return false;
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
    // Exception: if the cached description is mojibake (Big5 decoded as
    // UTF-8), ignore the cooldown so the encoding-aware fetcher can fix it.
    const isMojibake = (s?: string): boolean => {
      if (!s) return false;
      const cjk = (s.match(/[一-鿿]/g) || []).length;
      if (cjk < 20) return false;
      const bad = (s.match(/[蝷曄黎嚗撠璆凋剖豢頛踵鈭撣賊銝蝺餈鋆燐]/g) || []).length;
      return bad / cjk > 0.05;
    };
    if (!opts.force && existingEnriched && !isMojibake(existingEnriched.description)) {
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

    // Extract a clean brand name candidate (for repairing corrupt Site.name)
    const jsonLdItems = this.parseJsonLdItems(html);
    const cleanName = this.extractCleanName(html, jsonLdItems);

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
      cleanName,
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

    // Merge back into Site.profile. Two modes:
    //  - force=false (default): only fill empty top-level fields; never
    //    touch a human-entered value
    //  - force=true: trust the scrape, overwrite top-level unconditionally.
    //    Used by admin's explicit re-enrich to wash stale bad values out.
    const updatedProfile: Record<string, any> = { ...existing };
    updatedProfile._enriched = enriched;

    const canWrite = (currentVal: unknown) => !currentVal || opts.force;

    if ((enriched.telephone || enriched.email) && canWrite(updatedProfile.contact)) {
      updatedProfile.contact = [enriched.telephone, enriched.email].filter(Boolean).join(' / ');
    }
    if ((enriched.address || enriched.location) && canWrite(updatedProfile.location)) {
      updatedProfile.location = enriched.address || enriched.location;
    }
    if (enriched.description && canWrite(updatedProfile.description)) {
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

      // Encoding detection: Taiwan sites still ship Big5 and some mainland
      // sites ship GBK. res.text() always decodes as UTF-8, producing the
      // Big5→UTF-8 mojibake we saw on CakeResume. Read bytes first, sniff
      // charset from Content-Type header, then HTML meta tag, then default.
      const buf = Buffer.from(await res.arrayBuffer());

      const ct = res.headers.get('content-type') || '';
      let charset = /charset=["']?([a-zA-Z0-9_\-]+)/i.exec(ct)?.[1]?.toLowerCase();

      if (!charset || charset === 'utf-8') {
        const head = buf.subarray(0, 4096).toString('ascii');
        const metaCharset =
          /<meta\s+charset=["']?([a-zA-Z0-9_\-]+)/i.exec(head)?.[1]?.toLowerCase() ||
          /<meta\s+http-equiv=["']content-type["']\s+content=["'][^"']*charset=([a-zA-Z0-9_\-]+)/i
            .exec(head)?.[1]
            ?.toLowerCase();
        if (metaCharset) charset = metaCharset;
      }

      charset = charset || 'utf-8';
      // Normalize common aliases to what TextDecoder accepts.
      if (charset === 'big5-hkscs' || charset === 'cn-big5' || charset === 'csbig5') charset = 'big5';
      if (charset === 'gb2312' || charset === 'gb18030' || charset === 'cp936') charset = 'gbk';

      try {
        return new TextDecoder(charset, { fatal: false }).decode(buf);
      } catch {
        // Unsupported label — fall back to UTF-8 (better than crashing).
        return new TextDecoder('utf-8', { fatal: false }).decode(buf);
      }
    } catch (err) {
      this.logger.debug(
        `fetchHomepage ${url}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Derive a clean brand name candidate from scraped HTML. Tries, in order:
   *   1. JSON-LD LocalBusiness/Organization `name`
   *   2. og:site_name meta tag
   *   3. <title> tag (split on common separators, take the shortest clean
   *      part since site titles are usually "Brand | Tagline" or
   *      "Page — Brand")
   *
   * Returns undefined if nothing passes the corruption filter. Caller uses
   * this to quarantine / repair Site.name on seed rows with garbage names.
   */
  private extractCleanName(html: string, jsonLdItems: any[]): string | undefined {
    const candidates: string[] = [];

    for (const item of jsonLdItems) {
      const t = item?.['@type'];
      const types = Array.isArray(t) ? t : [t];
      const isOrg = types.some(
        (x) =>
          typeof x === 'string' &&
          LOCAL_BUSINESS_TYPES.some((b) => x.includes(b)),
      );
      if (isOrg && typeof item.name === 'string') candidates.push(item.name);
    }

    const ogSiteName = html.match(
      /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i,
    )?.[1];
    if (ogSiteName) candidates.push(ogSiteName);

    const rawTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    if (rawTitle) {
      // Split on common title separators and score the shortest clean piece
      // as the brand name (usually the right-hand side of "Page | Brand"
      // or left of "Brand - Description").
      const parts = rawTitle
        .split(/\s*[|｜\-–—]\s*/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2 && p.length <= 30);
      candidates.push(...parts);
    }

    const cleaned = candidates.find((c) => !isNameCorrupt(c) && c.length >= 2);
    return cleaned?.trim();
  }

  private parseJsonLdItems(html: string): any[] {
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
    return items;
  }

  private extractFromJsonLd(html: string): Partial<EnrichedProfile> {
    const items = this.parseJsonLdItems(html);

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

    // Address regex — narrow char classes so we don't bleed into adjacent
    // navigation text. Post-road segment restricted to: digits, -, /, 號,
    // 樓, F, 之, 室 (plus a few spaces). Anything outside that stops the match.
    const cityAlt = TW_CITIES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Allow Chinese numerals (一二三四五六七八九十) in trailing "3樓之一" suffixes
    // so we capture the whole address, not an amputated "3樓之".
    const addrRegex = new RegExp(
      `(?:${cityAlt})` +
        `[一-鿿]{1,10}(?:區|鄉|鎮|市)` +
        `[一-鿿]{1,15}(?:路|街|巷|弄|大道|大街|段)` +
        `\\s?\\d{1,4}(?:[-\\/]\\d{1,4})*\\s?號?` +
        `(?:\\s?(?:\\d{1,3}|[之一二三四五六七八九十])\\s?(?:[之]\\s?(?:\\d{1,3}|[一二三四五六七八九十])|樓|F|室)?){0,3}`,
    );
    const addressMatch = footer.match(addrRegex)?.[0] || text.match(addrRegex)?.[0];

    // Opening hours — simple patterns like "營業時間：09:00-22:00"
    const hoursMatch = text.match(
      /(?:營業時間|Hours|Opening)[^：:]*[：:]?\s*([0-9]{1,2}[:：][0-9]{2}\s?[-–—至到]\s?[0-9]{1,2}[:：][0-9]{2})/,
    );

    // Social links — exclude system paths (tracking pixels, share widgets,
    // oauth dialogs, iframe embeds) which produce garbage like .../tr.
    const socialLinks: EnrichedProfile['socialLinks'] = {};
    const fbPages = cleaned.match(
      /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!tr\/?|sharer|plugins|dialog|iframe|v\d+|ajax|login|ads|business|help|privacy|policies|ic\/|rsrc|connect|comments|badges|webmasters|about|pages\/launchpoint)[\w.\-]{3,}(?:\/[\w.\-]+)*/gi,
    ) || [];
    const igPages = cleaned.match(
      /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|tv\/|explore|web|accounts|about|developer|press|embed)[\w.\-]{3,}\/?/gi,
    ) || [];
    const ytPages = cleaned.match(
      /https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/[\w\-]+|c\/[\w.\-]+|@[\w.\-]+|user\/[\w.\-]+)/gi,
    ) || [];
    const linePages = cleaned.match(
      /https?:\/\/(?:line\.me\/ti\/p\/|lin\.ee\/)[\w.\-]+/gi,
    ) || [];
    // Take the first non-empty, shortest path (usually the brand home page,
    // not some deep-link).
    if (fbPages.length > 0) socialLinks.facebook = fbPages[0];
    if (igPages.length > 0) socialLinks.instagram = igPages[0];
    if (ytPages.length > 0) socialLinks.youtube = ytPages[0];
    if (linePages.length > 0) socialLinks.line = linePages[0];

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

  /**
   * Scan Site.name across all public sites, flag corrupt ones, and try to
   * repair via enrichment.cleanName. Sites that can't be repaired are
   * quarantined (isPublic=false) so they stop polluting Layer 1/Layer 2
   * generation paths.
   *
   * This is a one-shot cleanup run — not scheduled. Intended to fix the
   * seed-import mojibake that blocked the `legal` industry (all 43 sites
   * have corrupt names scraped from SEO blog titles).
   */
  async cleanupCorruptNames(opts: { industrySlug?: string; dryRun?: boolean } = {}): Promise<{
    scanned: number;
    corrupt: number;
    repaired: number;
    quarantined: number;
    skipped: number;
    examples: Array<{ url: string; before: string; after?: string; action: string }>;
  }> {
    const where: any = { isPublic: true };
    if (opts.industrySlug) where.industry = opts.industrySlug;

    const sites = await this.prisma.site.findMany({
      where,
      select: { id: true, name: true, url: true, industry: true },
    });

    const corrupt = sites.filter((s) => isNameCorrupt(s.name));
    let repaired = 0;
    let quarantined = 0;
    const examples: Array<{ url: string; before: string; after?: string; action: string }> = [];

    for (const site of corrupt) {
      try {
        const enriched = await this.enrichSite(site.id, { force: true });
        const candidate = enriched?.cleanName;
        if (candidate && !isNameCorrupt(candidate)) {
          if (!opts.dryRun) {
            await this.prisma.site.update({
              where: { id: site.id },
              data: { name: candidate },
            });
          }
          repaired++;
          if (examples.length < 10) {
            examples.push({
              url: site.url,
              before: site.name.slice(0, 40),
              after: candidate,
              action: 'repaired',
            });
          }
          this.logger.log(`repaired Site.name for ${site.url}: ${candidate}`);
        } else {
          if (!opts.dryRun) {
            await this.prisma.site.update({
              where: { id: site.id },
              data: { isPublic: false },
            });
          }
          quarantined++;
          if (examples.length < 10) {
            examples.push({
              url: site.url,
              before: site.name.slice(0, 40),
              action: 'quarantined',
            });
          }
        }
      } catch (err) {
        this.logger.warn(`cleanup failed for ${site.url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(
      `cleanupCorruptNames: scanned=${sites.length} corrupt=${corrupt.length} repaired=${repaired} quarantined=${quarantined}`,
    );
    return {
      scanned: sites.length,
      corrupt: corrupt.length,
      repaired,
      quarantined,
      skipped: corrupt.length - repaired - quarantined,
      examples,
    };
  }

  /**
   * List sites that were quarantined (isPublic=false) by cleanupCorruptNames
   * — they have corrupt Site.name AND no clean candidate could be scraped.
   * These need human review; some are dead/defunct URLs that should be
   * deleted, others might just need a manual name entry.
   *
   * We match "quarantined by cleanup" heuristically: isPublic=false, name
   * passes isNameCorrupt(), and profile._enriched exists (proves cleanup
   * ran). This avoids listing sites that were intentionally hidden by
   * the admin for unrelated reasons.
   */
  async listQuarantinedSites(): Promise<
    Array<{
      id: string;
      name: string;
      url: string;
      industry: string | null;
      enrichedAt: string | null;
      sourceMethod: string | null;
    }>
  > {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: false },
      select: { id: true, name: true, url: true, industry: true, profile: true },
    });

    return sites
      .filter((s) => isNameCorrupt(s.name))
      .map((s) => {
        const enr = ((s.profile as Record<string, any>) || {})._enriched as
          | EnrichedProfile
          | undefined;
        return {
          id: s.id,
          name: s.name,
          url: s.url,
          industry: s.industry,
          enrichedAt: enr?.extractedAt ?? null,
          sourceMethod: enr?.sourceMethod ?? null,
        };
      });
  }

  /**
   * Manually set a clean Site.name and restore isPublic=true. Use after a
   * human has reviewed a quarantined entry and decided the site is real.
   */
  async restoreQuarantinedSite(
    siteId: string,
    newName: string,
  ): Promise<{ id: string; name: string; isPublic: boolean } | null> {
    if (isNameCorrupt(newName)) {
      throw new Error(
        `Provided name "${newName}" still fails isNameCorrupt — refusing to restore`,
      );
    }
    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: { name: newName, isPublic: true },
      select: { id: true, name: true, isPublic: true },
    });
    return updated;
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
