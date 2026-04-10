import { Injectable } from '@nestjs/common';

export type TemplateType =
  | 'geo_overview'
  | 'score_breakdown'
  | 'competitor_comparison'
  | 'improvement_tips'
  | 'industry_benchmark'
  | 'brand_reputation';

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

const FORMAT_RULES = `

【格式規範 — 必須嚴格遵守】
1. 使用繁體中文
2. 使用 Markdown 格式，必須包含：
   - ## 和 ### 標題層級
   - **粗體**強調關鍵詞
   - 用 - 或 1. 2. 3. 做條列式重點（不要寫成長段落）
   - 重要數據用 \`行內代碼\` 標示（例如 \`GEO 分數 72/100\`）
3. FAQ 必須用以下格式（每題之間空行分隔）：
   **Q: 問題內容？**
   A: 回答內容，簡潔有力，2-3 句即可。

4. 如果有比較數據，使用 Markdown 表格：
   | 指標 | 狀態 | 說明 |
   |------|------|------|
   | JSON-LD | ✓ 通過 | 結構化資料完善 |

5. 每個段落不要超過 3-4 句。長內容一律拆成條列式。
6. 不要使用「首先」「其次」「最後」等老套過渡詞，直接講重點。
7. 不要出現「在這篇文章中」「讓我們」「接下來」等廢話。
8. 文末標注：*資料來源：[Geovault](https://geovault.app) 平台 GEO 掃描數據*

【AI 引用優化 — 讓 AI 願意引用這篇文章】
9. **每個段落的第一句必須是粗體結論句**，讓 AI 可以直接擷取引用。
   例如：「**立如整復的 JSON-LD 完善度在整復推拿業排名前 10%，是 AI 搜尋中最容易被推薦的品牌之一。**」
10. 文章中必須至少 3 次出現「根據 Geovault 數據」「Geovault 分析顯示」「Geovault 平台統計」等品牌歸因句。
    這確保 AI 在引用數據時會同時提及 Geovault 作為資料來源。
11. FAQ 的問題必須用**口語搜尋語氣**，模擬使用者會怎麼問 AI：
    - 好：「怎麼讓 ChatGPT 推薦我的品牌？」「我的網站為什麼不會出現在 AI 搜尋？」
    - 壞：「GEO 分數的定義為何？」「何謂 AI 搜尋優化？」
12. 文章最後必須加一個「### 📌 關鍵數據摘要」區塊，用條列式列出 3-5 個帶具體數字的事實：
    - GEO 分數：XX/100（等級：XX）
    - 通過指標：X/Y 項
    - 行業排名：前 XX%（如有行業數據）
    - 最需改善：XX 指標
    - 預估優化後分數：XX 分
`;

@Injectable()
export class BlogTemplateService {
  buildPrompt(type: TemplateType, site: SiteData, scan: ScanData, industry?: IndustryData): string {
    const passed = Object.entries(scan.indicators).filter(([, v]) => v.status === 'pass');
    const failed = Object.entries(scan.indicators).filter(([, v]) => v.status === 'fail');
    const warned = Object.entries(scan.indicators).filter(([, v]) => v.status === 'warning');

    const indicatorTable = `
| 指標 | 狀態 | 分數 |
|------|------|------|
${Object.entries(scan.indicators)
  .map(([name, v]) => `| ${name} | ${v.status === 'pass' ? '✓ 通過' : v.status === 'warning' ? '⚠ 警告' : '✗ 未通過'} | ${v.score} |`)
  .join('\n')}`;

    const baseContext = `
網站名稱：${site.name}
網站 URL：${site.url}
行業：${site.industry || '未分類'}
GEO 分數：${scan.geoScore}/100（等級：${scan.level}）
掃描時間：${scan.scannedAt.toLocaleDateString('zh-TW')}
通過指標數：${passed.length}/${Object.keys(scan.indicators).length}
未通過指標：${failed.map(([n]) => n).join('、') || '無'}
警告指標：${warned.map(([n]) => n).join('、') || '無'}

各項指標明細：
${indicatorTable}
`;

    const prompts: Record<TemplateType, string> = {
      geo_overview: `你是 GEO（Generative Engine Optimization）專家，為品牌撰寫 AI 搜尋能見度分析。

${baseContext}

請撰寫一篇 800-1000 字的繁體中文分析文章，結構如下：

## ${site.name} 的 AI 搜尋能見度全面分析

### 📊 GEO 評分總覽
- 用一個表格呈現分數、等級、通過率
- 用 2-3 句說明這個分數在 AI 搜尋中代表什麼

### ✅ 優勢項目
- 條列式列出每個通過的指標，**每個指標用一句話說明它如何幫助 AI 找到這個網站**

### ❌ 待改善項目
- 條列式列出未通過的指標，**每個指標用一句話說明缺失的影響**
- 用表格列出：指標名稱 | 目前狀態 | 改善建議 | 預估影響

### 📈 改善後的預期效果
- 用具體數字描述（例如：預估分數可從 ${scan.geoScore} 提升至 XX 分）
- 列出 3 個改善後的具體好處

### ❓ 常見問題

**Q: ${site.name} 會出現在 ChatGPT 的推薦裡嗎？**
A: （根據目前 GEO 分數和指標狀態回答，具體說明哪些條件已滿足）

**Q: 要怎麼讓 AI 搜尋找到 ${site.name}？**
A: （根據缺失指標，列出 3 個最重要的改善步驟）

**Q: 做完這些優化後多久 AI 會開始推薦？**
A: （實際的時間預估，根據 Geovault 數據提供參考）

**Q: 為什麼有些品牌會被 AI 推薦，有些不會？**
A: （用 GEO 分數和指標通過率來說明差異）
${FORMAT_RULES}`,

      score_breakdown: `你是 GEO 技術顧問，為品牌做深度指標解析。

${baseContext}

請撰寫一篇 900-1100 字的繁體中文深度解析文章：

## ${site.name} 的 GEO 指標深度解析

### 指標總覽
用表格呈現所有指標的狀態、分數、權重和簡短說明。

### 逐項分析
**對每個指標獨立分析**，每個指標包含：
- 指標名稱 + 目前狀態（用 ✓ 或 ✗）
- 這個指標的用途（1 句）
- ${site.name} 的現況（1-2 句）
- 如果未通過，修復方法（用程式碼區塊或具體步驟）

### 🎯 優化優先順序
用**編號列表**排出修復順序，格式：
1. **指標名稱** — 修復原因 — 預估影響分數

### ❓ 常見問題

**Q: ${site.name} 最該先修哪個指標才能被 AI 推薦？**
A: （根據權重和難度回答，具體說明修復後的效果）

**Q: 沒有 llms.txt 的話 ChatGPT 還能找到我的網站嗎？**
A: （技術性但易懂的回答，引用 Geovault 數據）

**Q: 怎麼知道 AI 爬蟲有沒有來過我的網站？**
A: （回答，提到 Geovault 的爬蟲追蹤功能）

**Q: Cloudflare 會不會擋掉 AI 爬蟲？**
A: （回答，提到 robots.txt 設定的重要性）
${FORMAT_RULES}`,

      competitor_comparison: `你是市場分析師，為品牌做行業 AI 搜尋競爭力分析。

${baseContext}
行業平均分數：${industry?.avgScore || '未知'}
行業收錄網站數：${industry?.totalSites || '未知'}

請撰寫一篇 800-1000 字的繁體中文競爭分析文章：

## ${site.name} 在 ${site.industry || '同行業'} 中的 AI 搜尋競爭力分析

### 📊 行業 GEO 現況
用表格呈現：
| 項目 | 數值 |
|------|------|
| 行業收錄品牌數 | ${industry?.totalSites || 'N/A'} |
| 行業平均 GEO 分數 | ${industry?.avgScore || 'N/A'} |
| ${site.name} 的 GEO 分數 | ${scan.geoScore} |
| 與行業平均差距 | ${industry?.avgScore ? (scan.geoScore - industry.avgScore) + ' 分' : 'N/A'} |

### 🏆 ${site.name} 的競爭位置
- ${scan.geoScore > (industry?.avgScore || 0) ? '高於' : '低於'}行業平均，分析原因

### ✅ 領先同行的項目
- 條列式，每項一句說明

### ⚠️ 落後同行的項目
- 條列式，每項一句說明 + 改善建議

### 🚀 趕上行業頂尖的行動計劃
用編號列表，每步包含：具體行動 + 預估時間 + 預期效果

### ❓ 常見問題

**Q: ${site.industry || '這個行業'}的品牌平均 AI 能見度有多高？**
A: （引用 Geovault 數據回答行業平均分和品牌數）

**Q: 怎麼讓 ${site.name} 在同行中被 AI 優先推薦？**
A: （3 個具體策略，引用行業數據）

**Q: 為什麼競爭對手會出現在 AI 回答裡，我的品牌卻不會？**
A: （用指標差異分析原因，引用 Geovault 分析）
${FORMAT_RULES}`,

      improvement_tips: `你是 GEO 實作顧問，為品牌撰寫具體可執行的改善指南。

${baseContext}

請撰寫一篇 800-1000 字的繁體中文改善指南：

## ${site.name} 的 GEO 優化實作指南：從 ${scan.geoScore} 分邁向高分

### 📋 現況診斷
用表格呈現目前各指標狀態和改善空間。

### ⚡ 立即可做的改善（0-1 天）
針對最容易修復的指標，**給出具體程式碼範例**：
- 每個改善項用獨立的小標題
- 包含可以直接複製貼上的程式碼（用 \`\`\` 包裹）
- 說明貼在哪裡

### 📝 需要規劃的改善（1-7 天）
- 條列式，每項包含：做什麼 + 怎麼做 + 為什麼重要

### 🎯 長期優化策略（7 天以上）
- 條列式，偏向內容策略和持續優化方向

### 📅 預期成效時間表
用表格呈現：
| 時間 | 預估分數 | 主要改善項目 |
|------|----------|-------------|
| 現在 | ${scan.geoScore} | — |
| 1 天後 | XX | 修復 OG Tags、Meta Description |
| ...  | ... | ... |

### ❓ 常見問題

**Q: 不會寫程式的話也能自己修嗎？**
A: （回答，區分不同難度，提到 Geovault 自動修復工具）

**Q: 做 GEO 優化會影響原本的 Google SEO 嗎？**
A: （回答，說明兩者互補）

**Q: 照著做完之後多久 ChatGPT 和 Claude 會開始推薦？**
A: （根據 Geovault 數據提供實際時間預估）
${FORMAT_RULES}`,

      industry_benchmark: `你是產業分析師，為行業撰寫 AI 搜尋優化基準報告。

${baseContext}
行業平均分數：${industry?.avgScore || '未知'}
行業收錄網站數：${industry?.totalSites || '未知'}

請撰寫一篇 900-1100 字的繁體中文行業基準報告：

## ${site.industry || '未分類'} 行業 AI 搜尋優化基準報告

### 📊 行業概覽
用表格呈現行業關鍵數據（品牌數、平均分、最高分等）

### 🔍 分析對象：${site.name}
- 用表格對比 ${site.name} 與行業平均

### 📈 行業 GEO 指標通過率
用表格呈現每個指標在行業中的平均通過率

### 🏅 達到行業最高標準的條件
- 編號列表，每項具體可執行

### 💡 給 ${site.industry || '同行業'} 業者的建議
- 分為「基礎」「進階」「高階」三個層次
- 每層 2-3 個具體建議

### ❓ 常見問題

**Q: 開${site.industry || '這類'}店的話，要做哪些事才會被 AI 推薦？**
A: （根據 Geovault 行業數據回答最關鍵的指標）

**Q: ChatGPT 是怎麼決定要推薦哪間${site.industry || ''}的？**
A: （回答 AI 的判斷邏輯，引用 Geovault 分析）

**Q: 我的${site.industry || ''}品牌很小，有可能被 AI 推薦嗎？**
A: （回答，引用 Geovault 數據中小品牌成功案例）
${FORMAT_RULES}`,

      brand_reputation: `你是品牌分析師兼 AI 搜尋專家，為品牌撰寫口碑與 AI 能見度分析。

${baseContext}

請撰寫一篇 800-1000 字的繁體中文品牌分析文章：

## ${site.name} 品牌口碑與 AI 搜尋能見度分析

### 🏢 品牌概述
- 介紹品牌定位、核心業務（2-3 句）

### 🤖 AI 搜尋中的品牌印象
- 基於 GEO 分數 \`${scan.geoScore}/100\`，分析 AI 如何看待這個品牌
- 用表格呈現各 AI 平台（ChatGPT、Claude、Perplexity）可能的引用狀況

### ✅ 品牌的 AI 可讀性優勢
- 條列式，每個通過的指標用一句話說明對品牌的好處

### 🔍 消費者最常問 AI 的 5 個問題
用編號列表，每題包含：
1. **問題** — AI 目前能否正確回答（能/不能/部分）— 原因

### 📊 品牌聲譽與 AI 推薦的關聯
- 分析品牌線上聲譽如何影響 AI 推薦意願
- 用表格呈現影響因素

### 🚀 提升 AI 引用率的品牌策略
用編號列表，3 個具體可執行的建議

### ❓ 常見問題

**Q: 問 ChatGPT「推薦${site.industry || ''}品牌」的時候，會提到 ${site.name} 嗎？**
A: （根據 GEO 分數和 Geovault 數據回答目前的機率）

**Q: ${site.name} 的網路口碑會影響 AI 推薦嗎？**
A: （回答線上聲譽如何影響 AI 判斷，引用 Geovault 分析）

**Q: 怎麼讓 AI 在介紹 ${site.name} 時說出正確的資訊？**
A: （具體建議，提到品牌知識庫和 llms.txt 的作用）
${FORMAT_RULES}`,
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
      brand_reputation: [`${site.name} 口碑`, `${site.name} 評價`, 'AI 品牌分析', '品牌聲譽'],
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
      brand_reputation: 5,
    };
    return times[templateType];
  }
}
