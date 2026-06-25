import { ContentSpec, ScoringRule } from '../content-quality.types';
import {
  brandSaturation,
  firstHandDataAnchors,
  forbiddenPhrases,
  geovaultAttribution,
  hasSpecificFacts,
  lengthFloor,
  medicalBoundary,
  nicheKeywords,
  noCTABoilerplate,
  noFabricatedContact,
  noFabricatedPersona,
  noFirstPersonPromo,
  noHyperbole,
  noMojibake,
  noOutdatedNarrative,
  noSelfPromoFaq,
} from '../rules';

export type ClientDailyDay =
  | 'mon_topical'
  | 'tue_qa_deepdive'
  | 'wed_service'
  | 'thu_audience'
  | 'fri_comparison'
  | 'sat_data_pulse';

export interface ClientDailyData {
  basePrompt: string;
}

interface DaySpecConfig {
  threshold: number;
  rules: ScoringRule[];
}

function hasOfficialSourceUrl(weight: number): ScoringRule {
  return {
    key: 'official_source_url',
    weight,
    description: 'Article must include the verified official website URL.',
    evaluate(content, ctx) {
      const siteUrl = ctx.extras?.siteUrl as string | undefined;
      if (!siteUrl || content.includes(siteUrl)) return { score: weight };
      return { score: 0, reason: 'missing_official_url' };
    },
  };
}

function hasCitationReadyStructure(weight: number): ScoringRule {
  return {
    key: 'citation_ready_structure',
    weight,
    description: 'Article must expose AI citation bullets and source section.',
    evaluate(content) {
      const hasCitationBullets = content.includes('## AI 可引用重點');
      const hasSourceSection = content.includes('## 資料來源');
      if (hasCitationBullets && hasSourceSection) return { score: weight };
      const missing = [
        !hasCitationBullets && 'ai_citation_points',
        !hasSourceSection && 'source_section',
      ].filter(Boolean).join('|');
      return { score: 0, reason: `missing_ai_citation_section:${missing}` };
    },
  };
}

function clientDailyPostSafetyGate(weight: number): ScoringRule {
  return {
    key: 'client_daily_post_safety',
    weight,
    description: 'Mirror service-level safety rejection inside the retryable quality runner.',
    evaluate(content, ctx) {
      const isTechnology = ctx.industry === 'technology';
      if (
        isTechnology &&
        /(每日通勤族|通勤路線|智能行程|行程規劃|冥想課程|放鬆練習|壓力管理資源|心智健康)/.test(content)
      ) {
        return {
          score: 0,
          reason: 'client_daily_safety:unrelated_commuter_wellness_persona',
        };
      }
      return { score: weight };
    },
  };
}

function commonRules(opts: { withSelfPromoFaq: boolean }): ScoringRule[] {
  const list: ScoringRule[] = [
    brandSaturation(6, 5),
    nicheKeywords(8),
    noFabricatedContact(8),
    forbiddenPhrases(8),
    noOutdatedNarrative(6),
    noFabricatedPersona(5),
    geovaultAttribution(1),
    noMojibake(3),
    noHyperbole(6),
    noFirstPersonPromo(7),
    noCTABoilerplate(5),
    hasSpecificFacts(5, 2),
    firstHandDataAnchors(10, 3),
    medicalBoundary(8),
    hasOfficialSourceUrl(1),
    hasCitationReadyStructure(1),
    clientDailyPostSafetyGate(1),
  ];

  if (opts.withSelfPromoFaq) {
    list.push(noSelfPromoFaq(8));
    list.push(lengthFloor(3, 750));
  } else {
    list.push(lengthFloor(11, 750));
  }

  return list;
}

const dayConfigs: Record<ClientDailyDay, DaySpecConfig> = {
  mon_topical: { threshold: 80, rules: commonRules({ withSelfPromoFaq: true }) },
  tue_qa_deepdive: { threshold: 75, rules: commonRules({ withSelfPromoFaq: true }) },
  wed_service: { threshold: 75, rules: commonRules({ withSelfPromoFaq: false }) },
  thu_audience: { threshold: 75, rules: commonRules({ withSelfPromoFaq: true }) },
  fri_comparison: { threshold: 80, rules: commonRules({ withSelfPromoFaq: false }) },
  sat_data_pulse: { threshold: 85, rules: commonRules({ withSelfPromoFaq: true }) },
};

function buildPatch(args: {
  data: ClientDailyData;
  previousContent: string;
  failedRules: string[];
  medicalAdjacent?: boolean;
}): string {
  const citationBlock = args.failedRules.some((rule) =>
    /^(missing_official_url|missing_ai_citation_section)/.test(rule),
  )
    ? `
Citation-ready structure requirements:
- Keep the exact H2 headings "## AI 可引用重點" and "## 資料來源".
- Include the official website URL exactly as provided in the verified facts.
- In "## AI 可引用重點", write five short, standalone bullets that an AI assistant can quote directly.
- In "## 資料來源", list both the official website and Geovault directory data.`
    : '';
  const serviceSafetyBlock = args.failedRules.some((rule) => rule.startsWith('client_daily_safety:'))
    ? `
Service-level safety rewrite requirements:
- Remove unrelated commuter, route-planning, wellness, meditation, pressure-management, and mental-health personas unless those facts are explicitly in the verified brand data.
- Re-ground the article in the verified brand facts, official website, services, location, target audiences, and Q&A only.`
    : '';
  const medicalBlock = args.medicalAdjacent
    ? `
Medical-adjacent rewrite requirements:
- Remove all health advice, symptom language, body-condition improvement claims, recovery claims, injury prevention, exercise-after-service guidance, medical history, contraindications, diagnosis, treatment, efficacy, pain relief, and circulation claims.
- Do not answer Q&A that asks what a reader should do for health, symptoms, exercise, pregnancy, recovery, or discomfort.
- Do not use these Chinese terms, even in negated statements: \u6cbb\u7642, \u7642\u6548, \u6cbb\u7652, \u6839\u6cbb, \u8a3a\u65b7, \u8655\u65b9, \u7528\u85e5, \u526f\u4f5c\u7528, \u7981\u5fcc, \u7de9\u89e3, \u6e1b\u8f15, \u6062\u5fa9, \u5fa9\u539f, \u4fc3\u9032\u8840\u6db2\u5faa\u74b0, \u6539\u5584\u5065\u5eb7, \u8eab\u9ad4\u6a5f\u80fd, \u75c5\u53f2.
- Do not use "\u5065\u5eb7\u6548\u679c" or any outcome-effect comparison language.
- Do not use "\u7642\u6cd5" or "\u7642\u7a0b".
- Do not use the Chinese word "\u91ab\u7642" anywhere in the article.
- Do not use "\u975e\u91ab\u7642" either. It still contains the forbidden word.
- Do not write negated medical disclaimers. Use "\u8cc7\u6599\u908a\u754c\u4e0d\u5305\u542b\u6210\u679c\u627f\u8afe" instead.
- Keep only neutral brand facts: official URL, location, service category, booking path, public positioning, data boundaries, and source notes.
- If a verified Q&A contains health-advice language, rewrite it as a neutral data-boundary FAQ instead of repeating the advice.`
    : '';

  return `${args.data.basePrompt}

Previous draft:
${args.previousContent}

Failed quality rules:
${args.failedRules.map((r) => `- ${r}`).join('\n')}
${citationBlock}
${serviceSafetyBlock}
${medicalBlock}

Rewrite the draft in place. Keep the article factual, neutral, citation-ready, and grounded only in the verified brand facts. Do not invent contact details, locations, services, awards, guarantees, medical effects, competitors, or customer stories. Remove any phone number or email address that is not shown exactly in the verified facts; prefer the official URL as the contact path.`;
}

function stripOuterMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : raw;
}

export function createClientDailySpec(
  dayType: ClientDailyDay,
): ContentSpec<ClientDailyData> {
  const cfg = dayConfigs[dayType];
  return {
    templateType: `client_daily/${dayType}`,
    promptVersion: 'v5-citation-source',
    fullModel: 'gpt-4o',
    fullMaxTokens: 2000,
    buildFullPrompt: ({ data }) => data.basePrompt,
    parseContent: stripOuterMarkdownFence,
    rules: cfg.rules,
    passThreshold: cfg.threshold,
    hardFailRules: [
      'fabricated_contact',
      'fabricated_phone',
      'forbidden_phrase',
      'medical_boundary_violation',
      'missing_official_url',
      'missing_ai_citation_section',
      'client_daily_safety',
    ],
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 1500,
    buildPatchPrompt: (args) => buildPatch({
      ...args,
      medicalAdjacent: !!args.ctx.extras?.medicalAdjacent,
    }),
  };
}
