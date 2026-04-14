import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

/**
 * Flatten JSON-LD: extract individual schemas from @graph arrays and nested structures.
 * Handles: standalone schemas, @graph arrays, and arrays of schemas.
 */
function flattenJsonLd(raw: any[]): any[] {
  const result: any[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      result.push(...flattenJsonLd(item));
    } else if (item && typeof item === 'object') {
      if (Array.isArray(item['@graph'])) {
        // Inherit @context from parent into each graph node
        const ctx = item['@context'];
        for (const node of item['@graph']) {
          result.push({ ...(ctx && !node['@context'] ? { '@context': ctx } : {}), ...node });
        }
      } else {
        result.push(item);
      }
    }
  }
  return result;
}

@Injectable()
export class JsonLdIndicator implements IIndicatorAnalyzer {
  name = 'json_ld';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const rawScripts: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { rawScripts.push(JSON.parse($(el).html() || '')); } catch {}
    });

    const schemas = flattenJsonLd(rawScripts);

    if (schemas.length === 0) {
      return {
        score: 0, status: 'fail',
        details: { found: false, count: 0 },
        suggestion: '未偵測到 JSON-LD 結構化資料。建議新增 Organization 或 LocalBusiness Schema 以提升 AI 可讀性。',
        autoFixable: true,
      };
    }

    const types = schemas.map((s) => s['@type']).filter(Boolean);
    const hasContext = schemas.some((s) => s['@context']);
    const score = Math.min(100, 40 + schemas.length * 15 + (hasContext ? 20 : 0) + (types.length > 1 ? 15 : 0));

    return {
      score, status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, count: schemas.length, types, hasContext },
      suggestion: score < 100 ? '建議補充更多 Schema 類型（如 FAQ、Product）以完善結構化資料。' : undefined,
      autoFixable: true,
    };
  }
}
