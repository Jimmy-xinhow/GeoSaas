import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class OgTagsIndicator implements IIndicatorAnalyzer {
  name = 'og_tags';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const required = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
    const found: Record<string, string> = {};
    const missing: string[] = [];

    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property');
      const content = $(el).attr('content');
      if (prop && content) found[prop] = content;
    });

    required.forEach((tag) => { if (!found[tag]) missing.push(tag); });

    const score = Math.round((Object.keys(found).length / required.length) * 100);

    return {
      score: Math.min(100, score),
      status: missing.length === 0 ? 'pass' : missing.length <= 2 ? 'warning' : 'fail',
      details: { found, missing, totalFound: Object.keys(found).length, totalRequired: required.length },
      suggestion: missing.length > 0 ? `缺少以下 OG 標籤：${missing.join(', ')}。這些標籤有助於 AI 和社群平台理解您的頁面內容。` : undefined,
      autoFixable: true,
    };
  }
}
