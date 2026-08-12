import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

/**
 * Flatten JSON-LD: extract individual schemas from @graph arrays and nested structures.
 */
function flattenJsonLd(raw: any[]): any[] {
  const result: any[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      result.push(...flattenJsonLd(item));
    } else if (item && typeof item === 'object') {
      if (Array.isArray(item['@graph'])) {
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
export class FaqSchemaIndicator implements IIndicatorAnalyzer {
  name = 'faq_schema';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const rawScripts: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { rawScripts.push(JSON.parse($(el).html() || '')); } catch {}
    });

    const schemas = flattenJsonLd(rawScripts);
    const faqSchemas = schemas.filter((item) => item['@type'] === 'FAQPage');
    const totalQuestions = faqSchemas.reduce((acc, faq) => acc + (faq.mainEntity?.length || 0), 0);

    if (faqSchemas.length === 0) {
      return {
        score: 0, status: 'fail',
        details: { found: false, questionCount: 0 },
        suggestion: '未偵測到 FAQ Schema。若頁面已有可見的常見問題，可加入與可見內容一致的 FAQ 結構化資料，協助搜尋系統理解；這不保證 AI 引用。',
        autoFixable: true,
      };
    }

    const score = Math.min(100, 50 + totalQuestions * 10);
    return {
      score, status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, schemaCount: faqSchemas.length, questionCount: totalQuestions },
      suggestion: totalQuestions < 5 ? '若使用者確實還有常見問題，可補充完整回答；不要為了分數堆疊沒有實際需求的問答。' : undefined,
      autoFixable: true,
    };
  }
}
