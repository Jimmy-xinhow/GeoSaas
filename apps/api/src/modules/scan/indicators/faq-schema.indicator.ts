import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class FaqSchemaIndicator implements IIndicatorAnalyzer {
  name = 'faq_schema';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const jsonLd: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { jsonLd.push(JSON.parse($(el).html() || '')); } catch {}
    });

    const faqSchemas = jsonLd.filter((item) => item['@type'] === 'FAQPage');
    const totalQuestions = faqSchemas.reduce((acc, faq) => acc + (faq.mainEntity?.length || 0), 0);

    if (faqSchemas.length === 0) {
      return {
        score: 0, status: 'fail',
        details: { found: false, questionCount: 0 },
        suggestion: '未偵測到 FAQ Schema。FAQ 結構化資料能大幅提升被 AI 引用的機率，建議新增常見問題。',
        autoFixable: true,
      };
    }

    const score = Math.min(100, 50 + totalQuestions * 10);
    return {
      score, status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, schemaCount: faqSchemas.length, questionCount: totalQuestions },
      suggestion: totalQuestions < 5 ? '建議增加更多 FAQ 問答對（至少 5 個）以提升引用率。' : undefined,
      autoFixable: true,
    };
  }
}
