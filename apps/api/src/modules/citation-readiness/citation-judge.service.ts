import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { JudgeResult } from './citation-readiness.types';

// Default to Anthropic's strongest model per their guidance. Override via env
// CRG_JUDGE_MODEL (e.g. 'claude-haiku-4-5') if per-article cost matters at
// scale — that's an explicit operator decision, not a silent downgrade.
const DEFAULT_JUDGE_MODEL = 'claude-opus-4-8';
const MAX_ARTICLE_CHARS = 6000;

const READINESS_TOOL: Anthropic.Tool = {
  name: 'report_citation_readiness',
  description:
    'Report how likely an AI search engine (ChatGPT/Claude/Perplexity) is to retrieve, quote, and attribute this article. Score each dimension 0-100.',
  input_schema: {
    type: 'object',
    properties: {
      overall: { type: 'integer', description: '整體引用就緒度 0-100' },
      answerFirst: { type: 'integer', description: '開頭是否先給明確答案 0-100' },
      extractable: { type: 'integer', description: '是否有可被直接引用、離開上下文也成立、含品牌名+具體事實的句子 0-100' },
      queryMatch: { type: 'integer', description: 'targetQueries 是否能在內文得到自足回答 0-100' },
      specificity: { type: 'integer', description: '具體事實(數字/條件/時間)而非空泛宣稱 0-100' },
      citationSafety: { type: 'integer', description: '無未驗證宣稱/誇飾廣告腔(越安全越高) 0-100' },
      targetQueries: {
        type: 'array',
        items: { type: 'string' },
        description: '真實 AI 使用者最可能問、這篇該被引用的 3 個查詢',
      },
      factContradictions: {
        type: 'array',
        items: { type: 'string' },
        description: '內文與「品牌已驗證事實」矛盾或無根據的具體宣稱(沒有就空陣列)',
      },
      weakestPassage: { type: 'string', description: '引用就緒度最弱的一段原文(逐字節錄)' },
      suggestedRewrite: { type: 'string', description: '針對 weakestPassage 的具體改寫建議' },
    },
    required: [
      'overall', 'answerFirst', 'extractable', 'queryMatch', 'specificity',
      'citationSafety', 'targetQueries', 'factContradictions', 'weakestPassage', 'suggestedRewrite',
    ],
  },
};

@Injectable()
export class CitationJudgeService {
  private readonly logger = new Logger(CitationJudgeService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
    this.model = this.config.get<string>('CRG_JUDGE_MODEL') || DEFAULT_JUDGE_MODEL;
  }

  async judge(input: {
    content: string;
    brandName: string;
    industry?: string;
    profileRefText: string;
  }): Promise<JudgeResult> {
    if (!this.config.get('ANTHROPIC_API_KEY')) {
      return failed('ANTHROPIC_API_KEY 未設定');
    }

    const article = (input.content || '').slice(0, MAX_ARTICLE_CHARS);
    const facts = (input.profileRefText || '').slice(0, 3000);
    const prompt = this.buildPrompt(input.brandName, input.industry, facts, article);

    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        tools: [READINESS_TOOL],
        tool_choice: { type: 'tool', name: READINESS_TOOL.name },
        messages: [{ role: 'user', content: prompt }],
      });

      const block = resp.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') {
        return failed('judge_no_tool_use');
      }
      return normalize(block.input as Record<string, unknown>);
    } catch (error) {
      const msg = String(error);
      this.logger.error(`Citation judge failed (${this.model}): ${msg}`);
      return failed(msg.slice(0, 160));
    }
  }

  private buildPrompt(brandName: string, industry: string | undefined, facts: string, article: string): string {
    return `你是 AI 搜尋引用評審。模擬 ChatGPT / Claude / Perplexity 在回答使用者問題時，會不會「檢索到、引用、並正確標注」下面這篇文章。

【品牌】${brandName}${industry ? `（產業：${industry}）` : ''}
【品牌已驗證事實（判斷矛盾的依據）】
${facts || '（未提供）'}

【待評文章】
${article}

評分原則（每項 0-100）：
- answerFirst：AI 偏好「先給答案再展開」。開頭就直接回答一個明確問題的給高分。
- extractable：AI 摘走的是「離開上下文也成立、含品牌名+具體事實」的短句。有這種可引用單元的給高分。
- queryMatch：先想出真實使用者最可能問、這篇該被引用的 3 個查詢(targetQueries)，再看內文能不能自足回答它們。
- specificity：具體數字/條件/時間 vs 空泛宣稱。
- citationSafety：未驗證宣稱、誇飾、廣告腔會被 AI 降權；越乾淨越高。
- factContradictions：列出與「品牌已驗證事實」矛盾或無根據的具體宣稱（電話/地址/獎項/數據/服務範疇）；沒有就空陣列。
- weakestPassage / suggestedRewrite：挑引用就緒度最弱的一段原文，給出具體改寫。

請只透過 report_citation_readiness 工具回報，全部用繁體中文。`;
  }
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function strArr(v: unknown, cap = 5): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()).slice(0, cap);
}

function normalize(input: Record<string, unknown>): JudgeResult {
  return {
    ok: true,
    overall: num(input.overall),
    answerFirst: num(input.answerFirst),
    extractable: num(input.extractable),
    queryMatch: num(input.queryMatch),
    specificity: num(input.specificity),
    citationSafety: num(input.citationSafety),
    targetQueries: strArr(input.targetQueries, 3),
    factContradictions: strArr(input.factContradictions, 5),
    weakestPassage: typeof input.weakestPassage === 'string' ? input.weakestPassage.slice(0, 600) : '',
    suggestedRewrite: typeof input.suggestedRewrite === 'string' ? input.suggestedRewrite.slice(0, 800) : '',
  };
}

function failed(error: string): JudgeResult {
  return {
    ok: false,
    error,
    overall: 0,
    answerFirst: 0,
    extractable: 0,
    queryMatch: 0,
    specificity: 0,
    citationSafety: 0,
    targetQueries: [],
    factContradictions: [],
    weakestPassage: '',
    suggestedRewrite: '',
  };
}
