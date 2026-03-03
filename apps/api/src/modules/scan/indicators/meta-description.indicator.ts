import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class MetaDescriptionIndicator implements IIndicatorAnalyzer {
  name = 'meta_description';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const description = $('meta[name="description"]').attr('content') || '';
    const length = description.length;

    if (!description) {
      return {
        score: 0, status: 'fail',
        details: { found: false, length: 0 },
        suggestion: '未偵測到 Meta Description。建議新增 50-160 字元的描述，幫助 AI 快速理解頁面主題。',
        autoFixable: true,
      };
    }

    let score = 50;
    if (length >= 50 && length <= 160) score = 100;
    else if (length >= 30 && length <= 200) score = 70;

    return {
      score, status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, length, content: description.substring(0, 200), optimal: length >= 50 && length <= 160 },
      suggestion: score < 100 ? `Meta Description 長度為 ${length} 字元，建議調整為 50-160 字元以獲得最佳效果。` : undefined,
      autoFixable: false,
    };
  }
}
