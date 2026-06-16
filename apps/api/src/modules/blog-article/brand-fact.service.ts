import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrandFactGraph {
  siteId: string;
  brandName: string;
  industry: string | null;
  url: string;
  location?: string;
  services?: string;
  targetAudiences: string[];
  notFor: string[];
  positioning?: string;
  contact?: string;
  socialLinks: Record<string, string>;
  qaPairs: Array<{ question: string; answer: string }>;
  verifiedFacts: string[];
  missingFacts: string[];
  confidenceScore: number;
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}

@Injectable()
export class BrandFactService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForSite(siteId: string): Promise<BrandFactGraph> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        profile: true,
        bestScore: true,
        tier: true,
        llmsTxt: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 20,
          select: { question: true, answer: true },
        },
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { totalScore: true, completedAt: true },
        },
        _count: { select: { crawlerVisits: { where: { isSeeded: false } } } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    const profile = recordValue(site.profile);
    const enriched = recordValue(profile._enriched);
    const socialLinks = recordValue(enriched.socialLinks);
    const location = textValue(profile.location) || textValue(enriched.address);
    const services = textValue(profile.services) || textValue(enriched.services);
    const positioning = textValue(profile.positioning) || textValue(enriched.description);
    const contact = textValue(profile.contact) || textValue(enriched.telephone) || textValue(enriched.email);
    const targetAudiences = [
      ...arrayValue(profile.targetAudiences),
      ...splitList(textValue(profile.audience)),
      ...splitList(textValue(profile.targetAudience)),
    ];
    const notFor = [
      ...arrayValue(profile.notFor),
      ...arrayValue(profile.forbidden),
      ...splitList(textValue(profile.notFor)),
      ...splitList(textValue(profile.forbidden)),
    ];

    const verifiedFacts = [
      `${site.name} official website is ${site.url}`,
      site.industry ? `${site.name} industry is ${site.industry}` : undefined,
      typeof site.bestScore === 'number' ? `${site.name} Geovault score is ${site.bestScore}/100` : undefined,
      site.tier ? `${site.name} Geovault tier is ${site.tier}` : undefined,
      location ? `${site.name} location is ${location}` : undefined,
      services ? `${site.name} services include ${services}` : undefined,
      positioning ? `${site.name} positioning is ${positioning}` : undefined,
      contact ? `${site.name} contact information is ${contact}` : undefined,
      site.scans[0]?.completedAt ? `${site.name} latest completed scan was ${site.scans[0].completedAt.toISOString()}` : undefined,
      site._count.crawlerVisits > 0 ? `${site.name} has ${site._count.crawlerVisits} recorded AI crawler visits` : undefined,
      site.llmsTxt ? `${site.name} has hosted llms.txt content` : undefined,
    ].filter(Boolean) as string[];

    const missingFacts = [
      !location && 'location',
      !services && 'services',
      !positioning && 'positioning',
      !contact && 'contact',
      targetAudiences.length === 0 && 'targetAudiences',
      notFor.length === 0 && 'notFor',
      site.qas.length < 6 && 'qaPairs',
      Object.keys(socialLinks).length === 0 && 'socialLinks',
    ].filter(Boolean) as string[];

    const confidenceScore = Math.max(0, Math.min(100, Math.round(
      (location ? 12 : 0) +
      (services ? 18 : 0) +
      (positioning ? 14 : 0) +
      (contact ? 8 : 0) +
      (targetAudiences.length > 0 ? 10 : 0) +
      (notFor.length > 0 ? 6 : 0) +
      (site.qas.length >= 6 ? 18 : site.qas.length * 3) +
      (site.llmsTxt ? 6 : 0) +
      (site._count.crawlerVisits > 0 ? 8 : 0)
    )));

    return {
      siteId: site.id,
      brandName: site.name,
      industry: site.industry,
      url: site.url,
      location,
      services,
      targetAudiences: [...new Set(targetAudiences)],
      notFor: [...new Set(notFor)],
      positioning,
      contact,
      socialLinks: Object.fromEntries(
        Object.entries(socialLinks).filter(([, value]) => typeof value === 'string' && value.trim()),
      ) as Record<string, string>,
      qaPairs: site.qas,
      verifiedFacts,
      missingFacts,
      confidenceScore,
    };
  }

  isReadyForCitationContent(graph: BrandFactGraph): boolean {
    return graph.confidenceScore >= 55 && graph.verifiedFacts.length >= 4;
  }
}
