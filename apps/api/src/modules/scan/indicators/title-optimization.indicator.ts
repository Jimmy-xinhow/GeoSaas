import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class TitleOptimizationIndicator implements IIndicatorAnalyzer {
  name = 'title_optimization';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const title = $('title').text().trim();
    const length = title.length;

    if (!title) {
      return {
        score: 0, status: 'fail',
        details: { found: false, length: 0 },
        suggestion: '未偵測到頁面標題。頁面標題是 AI 理解頁面的首要依據，請務必新增。',
        autoFixable: false,
      };
    }

    let score = 50;
    if (length >= 30 && length <= 60) score = 100;
    else if (length >= 20 && length <= 70) score = 75;
    else if (length > 70) score = 40;

    const hasKeyword = title.includes('|') || title.includes('-') || title.includes('—');

    return {
      score: Math.min(100, score + (hasKeyword ? 0 : -10)),
      status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, title, length, optimalLength: length >= 30 && length <= 60 },
      suggestion: score < 100 ? `標題長度 ${length} 字元，建議 30-60 字元。包含品牌名和關鍵字可提升辨識度。` : undefined,
      autoFixable: false,
    };
  }
}
