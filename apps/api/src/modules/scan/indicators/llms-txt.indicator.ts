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
        suggestion: '未偵測到 /llms.txt 檔案。這是 AI 爬蟲用來理解您網站的重要檔案，類似 robots.txt。建議立即新增。',
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
      suggestion: score < 100 ? '建議完善 llms.txt 內容，加入更詳細的網站描述和重要頁面連結。' : undefined,
      autoFixable: true,
    };
  }
}
