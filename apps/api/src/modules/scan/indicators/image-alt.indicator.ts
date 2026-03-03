import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class ImageAltIndicator implements IIndicatorAnalyzer {
  name = 'image_alt';

  async analyze({ $ }: AnalysisInput): Promise<IndicatorResult> {
    const images = $('img');
    const total = images.length;

    if (total === 0) {
      return {
        score: 100, status: 'pass',
        details: { totalImages: 0, withAlt: 0, withoutAlt: 0, coverage: 100 },
        autoFixable: false,
      };
    }

    let withAlt = 0;
    const missingAlt: string[] = [];
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt && alt.trim()) { withAlt++; }
      else { missingAlt.push($(el).attr('src') || 'unknown'); }
    });

    const coverage = Math.round((withAlt / total) * 100);
    return {
      score: coverage,
      status: coverage >= 90 ? 'pass' : coverage >= 60 ? 'warning' : 'fail',
      details: { totalImages: total, withAlt, withoutAlt: total - withAlt, coverage, missingAltSrcs: missingAlt.slice(0, 5) },
      suggestion: coverage < 100 ? `${total - withAlt} 張圖片缺少 ALT 屬性（共 ${total} 張）。為所有圖片添加描述性 ALT 文字可提升 AI 理解能力。` : undefined,
      autoFixable: false,
    };
  }
}
