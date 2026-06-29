// Deterministic entity-consistency lint — the half of the CRG that needs no
// LLM. Entity consistency (same name, real contact, official URL) is what lets
// an AI engine merge scattered mentions into ONE entity, which is the
// precondition for being recommended — not just cited.

import { EntityResult } from './citation-readiness.types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Detect phone/email in the article that do NOT appear in the brand's own
 * reference text. Mirrors content-quality's noFabricatedContact, but emails
 * compare against the raw (non-dot-stripped) ref so real emails aren't
 * false-flagged.
 */
export function detectFabricatedContact(content: string, profileRefText: string): string[] {
  const rawRef = (profileRefText || '').toLowerCase();
  const refDigits = rawRef.replace(/[-\s.()]/g, '');
  const violations: string[] = [];

  const phones =
    content.match(/\b(?:\+?886[-\s.]?\d|0\d)[-\s.]?\d{2,4}[-\s.]?\d{3,4}(?:[-\s.]?\d{2,4})?\b/g) || [];
  for (const p of phones) {
    const pn = p.replace(/[-\s.()]/g, '');
    if (pn.length >= 7 && !refDigits.includes(pn)) {
      violations.push(`phone:${p}`);
      break;
    }
  }

  const emails = content.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  for (const e of emails) {
    if (!rawRef.includes(e.toLowerCase())) {
      violations.push(`email:${e}`);
      break;
    }
  }

  return violations;
}

/**
 * Deterministic entity checks: brand name present, official URL present, no
 * fabricated contact. Score starts at 100 and is docked per failure. The
 * semantic "does it contradict a verified fact" check is left to the LLM judge
 * (merged into EntityResult.contradictions by the orchestrator).
 */
export function assessEntityConsistency(
  content: string,
  opts: { brandName: string; siteUrl: string; profileRefText: string },
): Omit<EntityResult, 'contradictions' | 'hardFail'> {
  const brandPresent = !!opts.brandName && new RegExp(escapeRegex(opts.brandName)).test(content);
  const urlHost = safeHost(opts.siteUrl);
  const officialUrlPresent =
    (!!opts.siteUrl && content.includes(opts.siteUrl)) || (!!urlHost && content.includes(urlHost));
  const fabricatedContact = detectFabricatedContact(content, opts.profileRefText);

  let score = 100;
  if (!brandPresent) score -= 40;
  if (!officialUrlPresent) score -= 20;
  if (fabricatedContact.length > 0) score -= 40;

  return {
    score: Math.max(0, score),
    brandPresent,
    officialUrlPresent,
    fabricatedContact,
  };
}

function safeHost(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    // strip scheme + path manually if URL() fails
    return url.replace(/^https?:\/\//, '').split('/')[0] || '';
  }
}
