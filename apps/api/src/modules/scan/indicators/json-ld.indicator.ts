import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class JsonLdIndicator implements IIndicatorAnalyzer {
  name = 'json_ld';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const scripts: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { scripts.push(JSON.parse($(el).html() || '')); } catch {}
    });

    if (scripts.length === 0) {
      return {
        score: 0, status: 'fail',
        details: { found: false, count: 0 },
        suggestion: '未偵測到 JSON-LD 結構化資料。建議新增 Organization 或 LocalBusiness Schema 以提升 AI 可讀性。',
        autoFixable: true,
      };
    }

    const types = scripts.map((s) => s['@type']).filter(Boolean);
    const hasContext = scripts.every((s) => s['@context']);
    const score = Math.min(100, 40 + scripts.length * 15 + (hasContext ? 20 : 0) + (types.length > 1 ? 15 : 0));

    return {
      score, status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, count: scripts.length, types, hasContext },
      suggestion: score < 100 ? '建議補充更多 Schema 類型（如 FAQ、Product）以完善結構化資料。' : undefined,
      autoFixable: true,
    };
  }
}
