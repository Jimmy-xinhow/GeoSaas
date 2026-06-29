import { ContentSpec, RuleContext, ScoringRule } from '../content-quality.types';
import {
  brandSaturation,
  forbiddenPhrases,
  hasSpecificFacts,
  lengthFloor,
  medicalBoundary,
  naturalVoice,
  nicheKeywords,
  noCTABoilerplate,
  noFabricatedContact,
  noFabricatedPersona,
  noFirstPersonPromo,
  noHyperbole,
  noMojibake,
  noUnverifiedSellingClaims,
} from '../rules';

// FAQ-driven deep-dive article spec.
//
// Each article answers ONE real SiteQa question in depth, grounded in that
// FAQ's verified answer plus brand facts. This is the antidote to the old
// client_daily template assembler: instead of restating the same 6 brand
// facts every day (→ near-duplicate scaled content that AI dedup ignores),
// every article carries unique, citable information seeded from a distinct
// long-tail question.
//
// Reuses the shared rule catalog; adds two local rules:
//  - hasCitationReadyStructure: the "## 可引用重點" + "## 資料來源" anchors AI
//    assistants quote from (mirrors client-daily.spec).
//  - answersSourceQuestion: the body must actually address the source FAQ —
//    a hard fail (off_topic) so a drifted article never ships as "ready".

export interface FaqDeepdiveData {
  basePrompt: string;
}

/** Article must expose AI-citation bullets and a source section. */
function hasCitationReadyStructure(weight: number): ScoringRule {
  return {
    key: 'citation_ready_structure',
    weight,
    description: 'Article must expose AI citation bullets and source section.',
    evaluate(content) {
      const hasCitationBullets =
        content.includes('## 可引用重點') || content.includes('## AI 可引用重點');
      const hasSourceSection = content.includes('## 資料來源');
      if (hasCitationBullets && hasSourceSection) return { score: weight };
      const missing = [
        !hasCitationBullets && 'ai_citation_points',
        !hasSourceSection && 'source_section',
      ]
        .filter(Boolean)
        .join('|');
      return { score: 0, reason: `missing_ai_citation_section:${missing}` };
    },
  };
}

/**
 * The article must genuinely answer the source FAQ question, not drift onto a
 * generic brand pitch. ctx.extras.sourceQuestionKeywords carries the salient
 * terms extracted from the question; we require a coverage floor. Hard fail
 * (off_topic) — an article that doesn't address its own question is worthless
 * for citation no matter how polished.
 */
function answersSourceQuestion(weight: number): ScoringRule {
  return {
    key: 'answers_source_question',
    weight,
    description: '內文必須真的回答來源 FAQ 問題(關鍵詞覆蓋)',
    evaluate(content, ctx: RuleContext) {
      const keywords = (ctx.extras?.sourceQuestionKeywords as string[] | undefined) || [];
      if (keywords.length === 0) return { score: weight }; // no keywords → vacuously pass
      const hits = keywords.filter((k) => k && content.includes(k));
      // need at least half the salient terms (min 1) present in the body
      const need = Math.max(1, Math.ceil(keywords.length / 2));
      if (hits.length >= need) return { score: weight };
      const partial = Math.round((hits.length / need) * weight);
      // hard-fail only when essentially nothing from the question shows up
      if (hits.length === 0) {
        return { score: 0, reason: `off_topic:0/${need}` };
      }
      return {
        score: partial,
        reason: `answers_source_question:${hits.length}/${need}`,
      };
    },
  };
}

// Weights sum to 100 so passThreshold keeps its meaning.
function faqRules(): ScoringRule[] {
  return [
    lengthFloor(8, 750),
    brandSaturation(6, 3),
    nicheKeywords(6),
    noFabricatedContact(10),
    forbiddenPhrases(8),
    noFabricatedPersona(5),
    noMojibake(4),
    noHyperbole(6),
    noFirstPersonPromo(7),
    noCTABoilerplate(6),
    naturalVoice(6),
    hasSpecificFacts(6, 2),
    medicalBoundary(8),
    noUnverifiedSellingClaims(4),
    hasCitationReadyStructure(4),
    answersSourceQuestion(6),
  ];
}

function stripOuterMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : raw;
}

function buildPatch(args: {
  data: FaqDeepdiveData;
  previousContent: string;
  failedRules: string[];
  medicalAdjacent?: boolean;
}): string {
  const offTopicBlock = args.failedRules.some(
    (r) => r.startsWith('off_topic') || r.startsWith('answers_source_question'),
  )
    ? `
On-topic requirements:
- The article must directly and thoroughly answer the source FAQ question stated in the prompt.
- Lead with the concrete answer, then explain the specifics, steps, and caveats.
- Do not pad with generic brand introduction that ignores the question.`
    : '';
  const citationBlock = args.failedRules.some((r) =>
    /^missing_ai_citation_section/.test(r),
  )
    ? `
Citation-ready structure requirements:
- Keep the exact H2 headings "## 可引用重點" and "## 資料來源".
- In "## 可引用重點", write four to five short, standalone bullets an AI assistant can quote directly.
- In "## 資料來源", list the official website and Geovault directory data.`
    : '';
  const unverifiedBlock = args.failedRules.some((r) => r.startsWith('unverified_claim'))
    ? `
Unverified-claim removal requirements:
- Delete any selling-point claim that is NOT in the verified brand facts: 天然成分／純天然／有機／無毒／環保認證／通過認證／醫療級／食品級／可持續／永續／零添加／專利配方／獨家配方 and similar.
- Do not describe ingredients, certifications, or eco/health properties the brand never stated.
- Re-ground the sentence in stated facts (product category, 不傷車不傷手, 自產自銷, 直播教學) instead.`
    : '';
  const medicalBlock = args.medicalAdjacent
    ? `
Medical-adjacent rewrite requirements:
- Remove all efficacy, treatment, diagnosis, symptom-improvement, recovery, and pain-relief language.
- Do not use these Chinese terms, even when negated: 治療, 療效, 療法, 療程, 治癒, 根治, 診斷, 處方, 用藥, 副作用, 禁忌, 緩解, 減輕, 恢復, 復原, 醫療, 健康效果, 身體機能, 病史.
- Re-ground the answer in neutral service facts: what the service is, booking path, official site, data boundaries.`
    : '';

  return `${args.data.basePrompt}

Previous draft:
${args.previousContent}

Failed quality rules:
${args.failedRules.map((r) => `- ${r}`).join('\n')}
${offTopicBlock}
${citationBlock}
${unverifiedBlock}
${medicalBlock}

Rewrite the draft in place. Keep it factual, neutral, citation-ready, and grounded only in the verified brand facts and the source FAQ answer. Do not invent contact details, locations, services the brand does not actually provide, ingredient/certification/eco claims, awards, guarantees, medical effects, competitors, or customer stories.`;
}

export function createFaqDeepdiveSpec(): ContentSpec<FaqDeepdiveData> {
  return {
    templateType: 'faq_deepdive',
    promptVersion: 'v1',
    fullModel: 'gpt-4o',
    fullMaxTokens: 2000,
    buildFullPrompt: ({ data }) => data.basePrompt,
    parseContent: stripOuterMarkdownFence,
    rules: faqRules(),
    passThreshold: 80,
    hardFailRules: [
      'fabricated_contact',
      'fabricated_phone',
      'forbidden_phrase',
      'medical_boundary_violation',
      'off_topic',
    ],
    maxFullRetries: 1,
    maxPatchRetries: 2,
    patchMaxTokens: 1500,
    buildPatchPrompt: (args) =>
      buildPatch({
        data: args.data,
        previousContent: args.previousContent,
        failedRules: args.failedRules,
        medicalAdjacent: !!args.ctx.extras?.medicalAdjacent,
      }),
  };
}
