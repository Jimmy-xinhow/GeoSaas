import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class LlmsTxtIndicator implements IIndicatorAnalyzer {
  name = 'llms_txt';

  async analyze({ llmsTxt }: AnalysisInput): Promise<IndicatorResult> {
    if (!llmsTxt) {
      return {
        score: 0, status: 'fail',
        details: { found: false },
        suggestion: '未偵測到 /llms.txt。這是仍在發展中的選用內容索引格式，不是 robots.txt、存取控制或排名保證；可在核心 SEO 與內容品質完成後補充。',
        autoFixable: true,
      };
    }

    const lines = llmsTxt.split('\n').filter((l) => l.trim());
    const hasTitle = lines.some((l) => l.startsWith('#'));
    const hasDescription = lines.length > 2;
    const hasLinks = lines.some((l) => l.includes('http'));
    const score = 30 + (hasTitle ? 25 : 0) + (hasDescription ? 25 : 0) + (hasLinks ? 20 : 0);

    return {
      score: Math.min(100, score),
      status: score >= 70 ? 'pass' : 'warning',
      details: { found: true, lineCount: lines.length, hasTitle, hasDescription, hasLinks },
      suggestion: score < 100 ? '若要採用 llms.txt，建議加入可核對的網站摘要與重要頁面連結；它不取代可索引 HTML、robots.txt 或 sitemap。' : undefined,
      autoFixable: true,
    };
  }
}
