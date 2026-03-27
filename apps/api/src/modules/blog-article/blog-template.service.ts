import { Injectable } from '@nestjs/common';

export type TemplateType =
  | 'geo_overview'
  | 'score_breakdown'
  | 'competitor_comparison'
  | 'improvement_tips'
  | 'industry_benchmark';

interface SiteData {
  name: string;
  url: string;
  description?: string;
  industry?: string;
}

interface ScanData {
  geoScore: number;
  level: string;
  indicators: Record<string, { score: number; status: string }>;
  scannedAt: Date;
}

interface IndustryData {
  avgScore?: number;
  totalSites?: number;
}

@Injectable()
export class BlogTemplateService {
  buildPrompt(type: TemplateType, site: SiteData, scan: ScanData, industry?: IndustryData): string {
    const indicatorStatus = Object.entries(scan.indicators)
      .map(([name, v]) => `- ${name}：${v.status === 'pass' ? '✓ 通過' : v.status === 'warning' ? '⚠ 警告' : '✗ 未通過'}（${v.score} 分）`)
      .join('\n');

    const baseContext = `
網站名稱：${site.name}
網站 URL：${site.url}
行業：${site.industry || '未分類'}
GEO 分數：${scan.geoScore}/100（等級：${scan.level}）
掃描時間：${scan.scannedAt.toLocaleDateString('zh-TW')}

各項指標狀態：
${indicatorStatus}
`;

    const prompts: Record<TemplateType, string> = {
      geo_overview: `你是一位 GEO（Generative Engine Optimization）專家。請根據以下網站資料，撰寫一篇 800–1000 字的繁體中文分析文章。

${baseContext}

文章結構要求：
## ${site.name} 的 AI 搜尋能見度全面分析

### GEO 評分總覽
### 優勢項目
### 待改善項目
### 改善後的預期效果
### 常見問題
Q: 什麼是 GEO 分數？
Q: ${site.name} 如何提升 AI 搜尋能見度？
Q: 多久能看到 GEO 優化的效果？
### 延伸閱讀

要求：文章語氣專業但易讀，包含具體數據，避免空泛建議。`,

      score_breakdown: `你是一位 GEO 技術顧問。請根據以下資料，撰寫一篇 900–1100 字的深度指標解析文章。

${baseContext}

文章結構：
## ${site.name} 的 GEO 8 項指標深度解析

逐一說明每個指標對 AI 搜尋的重要性及該網站現況。

### 優化優先順序建議
### 常見問題
Q: 哪個指標對 GEO 分數影響最大？
Q: ${site.name} 最應該優先修復哪個指標？
Q: llms.txt 是什麼？為什麼重要？`,

      competitor_comparison: `你是一位市場分析師。請根據以下資料，撰寫一篇 800–1000 字的同行比較分析文章。

${baseContext}
行業平均分數：${industry?.avgScore || '未知'}
行業收錄網站數：${industry?.totalSites || '未知'}

文章結構：
## ${site.name} 在 ${site.industry || '同行業'} 中的 AI 搜尋競爭力分析

### 行業 GEO 整體現況
### ${site.name} 的競爭位置
### 領先項目
### 落後項目
### 趕上行業頂尖的行動建議
### 常見問題`,

      improvement_tips: `你是一位 GEO 實作顧問。請根據以下資料，撰寫一篇 800–1000 字的具體改善指南。

${baseContext}

文章結構：
## ${site.name} 的 GEO 優化實作指南：從 ${scan.geoScore} 分到滿分的步驟

### 現況診斷
### 立即可做的改善（0–1 天）
### 需要規劃的改善（1–7 天）
### 長期優化策略（7 天以上）
### 預期成效時間表
### 常見問題`,

      industry_benchmark: `你是一位產業分析師。請根據以下資料，撰寫一篇 900–1100 字的行業基準報告。

${baseContext}
行業平均分數：${industry?.avgScore || '未知'}
行業收錄網站數：${industry?.totalSites || '未知'}

文章結構：
## ${site.industry || '未分類'} 行業 AI 搜尋優化基準報告：以 ${site.name} 為例

### 行業概覽
### 本次分析對象：${site.name}
### 行業 GEO 現況
### 達到行業最高標準的條件
### 給 ${site.industry || '同行業'} 業者的建議
### 常見問題`,
    };

    return prompts[type];
  }

  getTargetKeywords(type: TemplateType, site: SiteData): string[] {
    const base = [site.name, 'GEO 優化', 'AI 搜尋', site.industry || ''].filter(Boolean);
    const typeKeywords: Record<TemplateType, string[]> = {
      geo_overview: ['AI 友善度', 'GEO 分數', 'AI 引用'],
      score_breakdown: ['GEO 指標', 'llms.txt', 'JSON-LD', 'FAQ Schema'],
      competitor_comparison: ['競爭分析', '行業比較', 'AI 搜尋競爭力'],
      improvement_tips: ['GEO 優化方法', 'AI 搜尋優化', '具體改善步驟'],
      industry_benchmark: ['行業基準', `${site.industry} GEO`, '產業分析'],
    };
    return [...new Set([...base, ...typeKeywords[type]])];
  }

  estimateReadingTime(templateType: TemplateType): number {
    const times: Record<TemplateType, number> = {
      geo_overview: 4,
      score_breakdown: 5,
      competitor_comparison: 4,
      improvement_tips: 5,
      industry_benchmark: 5,
    };
    return times[templateType];
  }
}
