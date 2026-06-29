import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { BlogTemplateService, BrandShowcaseContext, BrandProfileMedicalMode } from './blog-template.service';
import { CitationReadinessService } from '../citation-readiness/citation-readiness.service';
import { CitationReadinessResult } from '../citation-readiness/citation-readiness.types';

const TEMPLATE_TYPE = 'brand_profile';
const DEFAULT_GEN_MODEL = 'claude-opus-4-8';
// Old GEO-score brand pages superseded by brand_profile — demoted once a
// citable page exists for the site.
const DEMOTE_TYPES = ['geo_overview', 'brand_reputation', 'industry_benchmark', 'competitor_comparison'];
// Daily rollout cap → spreads the ~617 brands-with-facts across ~30 days.
const DEFAULT_DAILY = 21;

export interface BrandProfileOutcome {
  siteId: string;
  siteName: string;
  status: 'generated' | 'rejected' | 'skipped';
  verdict?: string;
  score?: number;
  slug?: string;
  repaired?: boolean;
  reasons?: string[];
}

/**
 * Generates the citation-first per-brand directory page (templateType
 * brand_profile), gated by the Citation-Readiness Gate. Only articles the CRG
 * marks `ready` are persisted; `repair` gets one targeted rewrite of the
 * weakest passage and is re-judged; `reject` is never published. This is the
 * replacement for the GEO-score-centric templates the CRG proved uncitable.
 */
@Injectable()
export class BrandProfileService {
  private readonly logger = new Logger(BrandProfileService.name);
  private readonly anthropic: Anthropic;
  private readonly genModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly templateService: BlogTemplateService,
    private readonly crg: CitationReadinessService,
  ) {
    this.anthropic = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
    this.genModel = this.config.get<string>('BRAND_PROFILE_MODEL') || DEFAULT_GEN_MODEL;
  }

  async generateBrandProfile(siteId: string, opts: { force?: boolean } = {}): Promise<BrandProfileOutcome> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, industry: true, isPublic: true, profile: true },
    });
    if (!site) return { siteId, siteName: '', status: 'skipped', reasons: ['site_not_found'] };
    if (!site.isPublic) return { siteId, siteName: site.name, status: 'skipped', reasons: ['not_public'] };

    if (!opts.force) {
      const existing = await this.prisma.blogArticle.count({
        where: { siteId, templateType: TEMPLATE_TYPE, published: true },
      });
      if (existing > 0) return { siteId, siteName: site.name, status: 'skipped', reasons: ['already_exists'] };
    }

    const profile = (site.profile as Record<string, any>) || {};
    const ctx = await this.buildContext(siteId, profile);
    const siteData = {
      name: site.name,
      url: site.url,
      industry: site.industry || undefined,
      description: ctx.description,
    };
    const medicalMode = this.resolveMedicalMode(site.name, site.industry, profile, ctx);

    // 1. Generate
    const prompt = this.templateService.buildBrandProfilePrompt(siteData, ctx, medicalMode);
    let content = await this.generate(prompt);
    if (!content) return { siteId, siteName: site.name, status: 'rejected', reasons: ['generation_failed'] };

    // Inputs the CRG needs (shared across the initial + repaired assessment).
    const profileRefText = this.buildProfileRefText(siteData, ctx);
    const others = await this.prisma.blogArticle.findMany({
      where: { siteId, published: true, templateType: { not: TEMPLATE_TYPE } },
      select: { content: true },
      take: 200,
    });
    const corpus = others.map((o) => o.content || '');

    // 2. CRG gate
    let result = await this.crg.assess({
      content,
      brandName: site.name,
      siteUrl: site.url,
      industry: site.industry || undefined,
      profileRefText,
      existingCorpus: corpus,
    });

    // 3. One repair pass on `repair` (the weakest passage), then re-judge.
    let repaired = false;
    if (result.verdict === 'repair' && result.judge.ok && result.judge.weakestPassage) {
      const repairPrompt = this.buildRepairPrompt(prompt, content, result);
      const rewritten = await this.generate(repairPrompt);
      if (rewritten) {
        repaired = true;
        content = rewritten;
        result = await this.crg.assess({
          content,
          brandName: site.name,
          siteUrl: site.url,
          industry: site.industry || undefined,
          profileRefText,
          existingCorpus: corpus,
        });
      }
    }

    // 4. Only `ready` ships. Either way mark the attempt so it's never retried
    //    (no generate→reject→regenerate cost spiral).
    if (result.verdict !== 'ready') {
      this.logger.warn(`brand_profile ${site.name}: ${result.verdict} (${result.score}) — not published`);
      await this.markStatus(site.id, 'rejected', (result.reasons || [])[0]);
      return {
        siteId, siteName: site.name, status: 'rejected', verdict: result.verdict,
        score: result.score, repaired, reasons: result.reasons,
      };
    }

    const slug = await this.persist(site.id, site.name, site.url, site.industry, content);
    // A citable page now exists → demote the old GEO-score brand pages.
    await this.prisma.blogArticle.updateMany({
      where: { siteId: site.id, templateType: { in: DEMOTE_TYPES }, published: true },
      data: { published: false },
    });
    await this.markStatus(site.id, 'ready');
    this.logger.log(`brand_profile ${site.name}: READY ${result.score} → ${slug}`);
    return {
      siteId, siteName: site.name, status: 'generated', verdict: result.verdict,
      score: result.score, slug, repaired,
    };
  }

  /**
   * Daily rollout — spreads the brands-with-facts across ~30 days at
   * BRAND_PROFILE_DAILY/day. Each brand is attempted AT MOST ONCE: ready ones
   * publish + demote old GEO pages, rejected ones are recorded
   * (profile.brandProfileStatus='rejected') and never retried — no
   * generate→reject→regenerate cost spiral. A rejected brand can be re-attempted
   * later only by clearing its status flag (e.g. after fact enrichment).
   * Uses BRAND_PROFILE_MODEL (gen) + CRG_JUDGE_MODEL (judge) from env.
   */
  @Cron('0 6 * * *', { name: 'brand-profile-rollout' })
  async scheduledBrandProfileRollout(): Promise<void> {
    const dailyN = Number(this.config.get('BRAND_PROFILE_DAILY') || DEFAULT_DAILY);
    const pool = await this.prisma.site.findMany({
      where: { isPublic: true, isClient: false },
      select: {
        id: true,
        name: true,
        profile: true,
        blogArticles: { where: { templateType: TEMPLATE_TYPE }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 1500,
    });

    const candidates: string[] = [];
    for (const s of pool) {
      if (s.blogArticles.length) continue; // already has a brand_profile
      const pr = (s.profile as Record<string, any>) || {};
      if (pr.brandProfileStatus === 'ready' || pr.brandProfileStatus === 'rejected') continue; // attempted once
      const desc = pr.description || pr._enriched?.description || '';
      if (typeof desc !== 'string' || desc.length < 40) continue; // needs facts to be citable
      candidates.push(s.id);
      if (candidates.length >= dailyN) break;
    }

    if (candidates.length === 0) {
      this.logger.log('brand-profile-rollout: no remaining candidates');
      return;
    }

    let ready = 0;
    let rejected = 0;
    for (const id of candidates) {
      try {
        const r = await this.generateBrandProfile(id, { force: false });
        if (r.status === 'generated') ready++;
        else rejected++; // generateBrandProfile already marked the status
      } catch (err) {
        rejected++;
        await this.markStatus(id, 'rejected', String(err).slice(0, 120));
      }
    }
    this.logger.log(`brand-profile-rollout: ${ready} ready, ${rejected} rejected (attempted once, no retry)`);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** Record the one-time attempt outcome in profile JSON (no schema change). */
  private async markStatus(siteId: string, status: 'ready' | 'rejected', reason?: string): Promise<void> {
    try {
      const s = await this.prisma.site.findUnique({ where: { id: siteId }, select: { profile: true } });
      const profile = { ...((s?.profile as Record<string, any>) || {}) };
      profile.brandProfileStatus = status;
      profile.brandProfileAttemptedAt = new Date().toISOString();
      if (reason) profile.brandProfileReason = String(reason).slice(0, 200);
      else delete profile.brandProfileReason;
      await this.prisma.site.update({ where: { id: siteId }, data: { profile } });
    } catch (err) {
      this.logger.warn(`markStatus ${siteId} failed: ${String(err).slice(0, 120)}`);
    }
  }

  /**
   * Decide medical handling. The authoritative source is the per-brand flag
   * `profile.isLicensedMedical` (true = licensed clinic, false = non-medical
   * positioning). When absent, derive: licensed-clinic indicators in the
   * name/services → 'licensed'; otherwise medical-adjacent → 'boundary' (the
   * legally-safe default); non-medical → 'none'.
   */
  private resolveMedicalMode(
    name: string,
    industry: string | null,
    profile: Record<string, any>,
    ctx: BrandShowcaseContext,
  ): BrandProfileMedicalMode {
    const text = [name, industry, ctx.description, ctx.services, ctx.positioning]
      .filter(Boolean)
      .join(' ');
    const medicalAdjacent =
      ['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'].includes(industry ?? '') ||
      /(中醫|診所|醫院|醫師|醫療|整復|整骨|推拿|針灸|復健|物理治療|牙醫|養生|按摩)/.test(text);
    if (!medicalAdjacent) return 'none';

    if (profile.isLicensedMedical === true) return 'licensed';
    if (profile.isLicensedMedical === false) return 'boundary';

    // No explicit flag — heuristic. Licensed-clinic indicators vs non-medical wellness.
    const looksLicensed = /(中醫|診所|醫院|牙醫|醫師|聯合診所|clinic)/i.test(text);
    return looksLicensed ? 'licensed' : 'boundary';
  }

  private async buildContext(siteId: string, profile: Record<string, any>): Promise<BrandShowcaseContext> {
    const enriched = (profile._enriched as Record<string, any>) || {};
    const qaRows = await this.prisma.siteQa.findMany({
      where: { siteId },
      orderBy: { sortOrder: 'asc' },
      select: { question: true, answer: true },
      take: 30,
    });
    // Prefer informational, substantive questions for the "real user queries" block.
    const qas = qaRows
      .filter((q) => (q.question || '').trim().length >= 6)
      .filter((q) => (q.answer || '').replace(/\s+/g, '').length >= 30)
      .slice(0, 8)
      .map((q) => ({ question: q.question, answer: q.answer }));

    return {
      description: profile.description || enriched.description || '',
      services: profile.services || '',
      positioning: profile.positioning || '',
      location: profile.location || enriched.address || '',
      contact: profile.contact || profile.contactInfo || enriched.telephone || '',
      forbidden: Array.isArray(profile.forbidden) ? profile.forbidden : [],
      qas,
      siteId,
    };
  }

  private buildProfileRefText(site: { name: string; url: string }, ctx: BrandShowcaseContext): string {
    return [
      site.name, site.url, ctx.description, ctx.services, ctx.positioning, ctx.location, ctx.contact,
      ...(ctx.qas || []).flatMap((q) => [q.question, q.answer]),
    ]
      .filter((x) => typeof x === 'string' && x)
      .join(' \n ');
  }

  private buildRepairPrompt(originalPrompt: string, draft: string, result: CitationReadinessResult): string {
    return `${originalPrompt}

【上一版草稿】
${draft}

【引用就緒度最弱的一段】
${result.judge.weakestPassage}

【改進方向】
${result.judge.suggestedRewrite}

請依改進方向重寫整篇，把最弱那段改好，其餘維持品質。仍嚴禁自評 GEO 分數與編造事實。直接輸出 Markdown。`;
  }

  private async generate(prompt: string): Promise<string> {
    if (!this.config.get('ANTHROPIC_API_KEY')) {
      this.logger.error('ANTHROPIC_API_KEY 未設定');
      return '';
    }
    try {
      const resp = await this.anthropic.messages.create({
        model: this.genModel,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      return resp.content.find((b) => b.type === 'text')?.text || '';
    } catch (err) {
      this.logger.error(`brand_profile generation failed (${this.genModel}): ${String(err).slice(0, 200)}`);
      return '';
    }
  }

  private async persist(
    siteId: string,
    name: string,
    url: string,
    industry: string | null,
    content: string,
  ): Promise<string> {
    const title = (content.match(/^#{1,2}\s+(.+)$/m)?.[1] || `${name} 品牌介紹`).trim();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').slice(0, 30)}-${TEMPLATE_TYPE}-${Date.now().toString(36)}`;
    await this.prisma.blogArticle.create({
      data: {
        slug,
        title,
        description: content.slice(0, 200).replace(/#+\s/g, '').trim(),
        content,
        category: 'analysis',
        siteId,
        templateType: TEMPLATE_TYPE,
        industrySlug: industry || undefined,
        targetKeywords: this.templateService.getTargetKeywords('brand_reputation', {
          name,
          url,
          industry: industry || undefined,
        }),
        readingTimeMinutes: 5,
        readTime: '5 分鐘',
        published: true,
      },
    });
    return slug;
  }
}
