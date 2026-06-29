import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { maxSimilarity, DEFAULT_DUPLICATE_THRESHOLD } from '../content-quality/text-similarity.util';
import { CitationJudgeService } from './citation-judge.service';
import { assessEntityConsistency } from './entity-consistency.util';
import {
  CitationReadinessInput,
  CitationReadinessResult,
  CitationVerdict,
  CRG_PASS_THRESHOLD,
} from './citation-readiness.types';

@Injectable()
export class CitationReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly judge: CitationJudgeService,
  ) {}

  /**
   * Pure assessment — dedup + entity lint + Claude judge → verdict. No DB.
   * This is the function the live publish path will call in Phase 2.
   */
  async assess(input: CitationReadinessInput): Promise<CitationReadinessResult> {
    // 1. Dedup (deterministic, offline)
    const sim = maxSimilarity(input.content, input.existingCorpus);
    const isDuplicate = sim.score >= DEFAULT_DUPLICATE_THRESHOLD;
    const dedup = {
      score: Math.round(sim.score * 1000) / 1000,
      against: input.existingCorpus.length ? ('existing' as const) : ('none' as const),
      isDuplicate,
    };

    // 2. Entity consistency (deterministic)
    const entityBase = assessEntityConsistency(input.content, {
      brandName: input.brandName,
      siteUrl: input.siteUrl,
      profileRefText: input.profileRefText,
    });

    // 3. Claude citation-readiness judge (LLM)
    const judge = await this.judge.judge({
      content: input.content,
      brandName: input.brandName,
      industry: input.industry,
      profileRefText: input.profileRefText,
    });

    // Merge the judge's semantic contradictions into the entity verdict.
    const contradictions = judge.ok ? judge.factContradictions : [];
    const entityHardFail =
      !entityBase.brandPresent || entityBase.fabricatedContact.length > 0 || contradictions.length > 0;
    const entity = {
      ...entityBase,
      contradictions,
      hardFail: entityHardFail,
    };

    // 4. Aggregate → verdict + composite score
    const reasons: string[] = [];
    let verdict: CitationVerdict;

    const dedupHeadroom = Math.max(0, Math.min(100, Math.round(100 - sim.score * 200)));
    const score = Math.round(0.55 * judge.overall + 0.3 * entity.score + 0.15 * dedupHeadroom);

    if (isDuplicate) {
      verdict = 'reject';
      reasons.push(`near_duplicate:${dedup.score}`);
    } else if (entity.hardFail) {
      verdict = 'reject';
      if (!entityBase.brandPresent) reasons.push('brand_absent');
      if (entityBase.fabricatedContact.length) reasons.push(`fabricated_contact:${entityBase.fabricatedContact.join('|')}`);
      if (contradictions.length) reasons.push(`fact_contradiction:${contradictions.slice(0, 2).join('|')}`);
    } else if (!judge.ok) {
      // Judge unavailable → don't hard-block on the LLM; flag for manual review.
      verdict = 'repair';
      reasons.push(`judge_unavailable:${judge.error ?? 'unknown'}`);
    } else if (score >= CRG_PASS_THRESHOLD) {
      verdict = 'ready';
    } else {
      verdict = 'repair';
    }

    // Surface the soft signals that dragged the score down (actionable).
    if (judge.ok) {
      if (judge.answerFirst < 70) reasons.push(`weak_answer_first:${judge.answerFirst}`);
      if (judge.extractable < 70) reasons.push(`weak_extractable:${judge.extractable}`);
      if (judge.queryMatch < 70) reasons.push(`weak_query_match:${judge.queryMatch}`);
      if (judge.specificity < 70) reasons.push(`weak_specificity:${judge.specificity}`);
      if (judge.citationSafety < 70) reasons.push(`weak_citation_safety:${judge.citationSafety}`);
    }
    if (!entityBase.officialUrlPresent) reasons.push('no_official_url');

    return { verdict, score, dedup, entity, judge, reasons };
  }

  /**
   * Phase-1 dry-run convenience: load a published-or-draft article from the DB,
   * assemble its brand reference text + same-site dedup corpus, and assess it.
   * Used by the preview script/endpoint to validate the gate before wiring it
   * into any publish path.
   */
  async previewArticle(articleId: string): Promise<{
    articleId: string;
    title: string;
    siteName: string;
    result?: CitationReadinessResult;
    skipped?: string;
  }> {
    const article = await this.prisma.blogArticle.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, content: true, siteId: true },
    });
    if (!article) return { articleId, title: '', siteName: '', skipped: 'article_not_found' };
    if (!article.siteId) return { articleId, title: article.title, siteName: '', skipped: 'no_site' };

    const site = await this.prisma.site.findUnique({
      where: { id: article.siteId },
      select: { name: true, url: true, industry: true, profile: true },
    });
    if (!site) return { articleId, title: article.title, siteName: '', skipped: 'site_not_found' };

    const profileRefText = buildProfileRefText(site);

    const others = await this.prisma.blogArticle.findMany({
      where: { siteId: article.siteId, published: true, id: { not: article.id } },
      select: { content: true },
      take: 200,
    });

    const result = await this.assess({
      content: article.content || '',
      brandName: site.name,
      siteUrl: site.url,
      industry: site.industry ?? undefined,
      profileRefText,
      existingCorpus: others.map((o) => o.content || ''),
    });

    return { articleId, title: article.title, siteName: site.name, result };
  }
}

/** Assemble brand-owned reference text from the site profile (contact, enriched, qa). */
function buildProfileRefText(site: { name: string; url: string; industry: string | null; profile: unknown }): string {
  const p = (site.profile as Record<string, any>) || {};
  const enriched = (p._enriched as Record<string, any>) || {};
  const parts: Array<unknown> = [
    site.name,
    site.url,
    site.industry,
    p.description,
    p.contact,
    p.contactInfo,
    p.email,
    p.phone,
    p.telephone,
    p.address,
    p.lineId,
    p.services,
    p.positioning,
    enriched.description,
    enriched.telephone,
    enriched.email,
    enriched.address,
    ...Object.values((enriched.socialLinks as Record<string, string>) || {}),
  ];
  if (Array.isArray(p.qa)) {
    for (const item of p.qa) {
      if (item && typeof item === 'object') parts.push((item as any).question, (item as any).answer);
    }
  }
  return parts.filter((x) => typeof x === 'string' && x).join(' \n ');
}
