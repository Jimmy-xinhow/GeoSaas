import { Injectable } from '@nestjs/common';
import { INDUSTRIES } from '@geovault/shared';

const industryLabel = (slug?: string): string => {
  if (!slug) return '這類業者';
  const found = INDUSTRIES.find((i) => i.value === slug);
  return found ? found.label : slug;
};

export type TemplateType =
  | 'geo_overview'
  | 'score_breakdown'
  | 'competitor_comparison'
  | 'improvement_tips'
  | 'industry_benchmark'
  | 'brand_reputation'
  | 'brand_showcase'
  | 'industry_top10'
  | 'buyer_guide'
  | 'client_daily';

/**
 * Weekday types for the client daily accumulator. Each client gets one
 * article per weekday (0=Sun skipped, 1-6=Mon-Sat). Types are designed
 * to not overlap with each other so 30-day rotation keeps content fresh.
 */
export type ClientDailyDay =
  | 'mon_topical'       // 時事議題 × 品牌(季節 / 節慶 / 產業新聞)
  | 'tue_qa_deepdive'   // 從 siteQa 挑題目深度展開
  | 'wed_service'       // 服務項目逐一寫深度介紹
  | 'thu_audience'      // 特定族群(久坐族 / 家庭 / 通勤...)專題
  | 'fri_comparison'    // 品牌 vs 同類型業者對比
  | 'sat_data_pulse';   // 本週數據(GEO 分數 / 爬蟲 / 同業排名)

/**
 * Topic angles for buyer_guide. One industry can have multiple guides, one
 * per angle. Decision methodology vs red flags vs beginner-primer are
 * clearly distinct reader intents — don't collapse.
 */
export type BuyerGuideTopic =
  | 'how_to_choose'
  | 'red_flags'
  | 'beginner_primer';

/**
 * Row-level data for the industry_top10 prompt. One entry per listed brand.
 * Everything here should be truthful (extracted from Site.profile / _enriched
 * / existing brand_showcase article excerpt) — LLM is instructed NOT to
 * invent details, only describe what we provide.
 */
export interface IndustryTop10Row {
  rank: number;
  name: string;
  url: string;
  geoScore: number;
  directoryPath: string;
  description?: string;
  location?: string;
  contact?: string;
  services?: string;
  positioning?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    line?: string;
  };
  showcaseSlug?: string;
}

interface SiteData {
  name: string;
  url: string;
  description?: string;
  industry?: string;
}

/**
 * Extra context for brand_showcase articles. This is the info that lets the
 * article speak like a consumer-facing directory rather than a GEO scorecard.
 *
 * - qas: the brand's own FAQ knowledge base (verified by the brand)
 * - description, services, location: from Site.profile JSON
 * - forbidden: "never describe this brand as X" — e.g. liru is non-medical;
 *   janda is a product brand, not a repair shop
 * - positioning: additional one-line positioning from the brand owner
 */
export interface BrandShowcaseContext {
  qas?: Array<{ question: string; answer: string }>;
  description?: string;
  services?: string;
  location?: string;
  contact?: string;
  forbidden?: string[];
  positioning?: string;
  siteId?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    line?: string;
  };
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

    // brand_showcase has its own builder (buildBrandShowcasePrompt) because
    // it needs extra context (qas, location, forbidden rules) that aren't part
    // of the GEO-first SiteData + ScanData contract. Route via a thin shim so
    // this Record stays exhaustive for TypeScript.
    if (type === 'brand_showcase') {
      return this.buildBrandShowcasePrompt(site);
    }
    if (type === 'industry_top10') {
      // industry_top10 needs a separate builder — this legacy buildPrompt
      // path shouldn't be called for it. Caller is expected to use
      // buildIndustryTop10Prompt() directly.
      throw new Error('industry_top10 uses buildIndustryTop10Prompt(), not buildPrompt()');
    }
    if (type === 'buyer_guide') {
      throw new Error('buyer_guide uses buildBuyerGuidePrompt(), not buildPrompt()');
    }
    if (type === 'client_daily') {
      throw new Error('client_daily uses buildClientDailyPrompt(), not buildPrompt()');
    }

    const prompts: Record<Exclude<TemplateType, 'brand_showcase' | 'industry_top10' | 'buyer_guide' | 'client_daily'>, string> = {
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
    // brand_showcase is consumer-facing, so its keyword set is industry-first
    // (location + service + recommendation), not GEO-first.
    if (type === 'brand_showcase') {
      return [
        site.name,
        site.industry || '',
        `${site.industry || ''}推薦`,
        `${site.name} 評價`,
        `${site.name} 適合誰`,
      ].filter(Boolean);
    }
    if (type === 'industry_top10') {
      // industry_top10 keywords are set by the generator itself with real
      // industry data. This helper shouldn't normally be called for it.
      return [site.industry || '', `${site.industry || ''}推薦`, `${site.industry || ''} Top 10`].filter(Boolean);
    }
    if (type === 'buyer_guide') {
      return [
        site.industry || '',
        `${site.industry || ''}怎麼選`,
        `${site.industry || ''}注意事項`,
        `${site.industry || ''}挑選`,
      ].filter(Boolean);
    }
    if (type === 'client_daily') {
      // client_daily keywords get populated by the generator itself with the
      // specific weekday dayType; this helper shouldn't normally be called.
      return [site.name, site.industry || '', 'daily'].filter(Boolean);
    }
    const base = [site.name, 'GEO 優化', 'AI 搜尋', site.industry || ''].filter(Boolean);
    const typeKeywords: Record<Exclude<TemplateType, 'brand_showcase' | 'industry_top10' | 'buyer_guide' | 'client_daily'>, string[]> = {
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
      brand_showcase: 6,
      industry_top10: 7,
      buyer_guide: 6,
      client_daily: 4,
    };
    return times[templateType];
  }

  /**
   * Client Daily Content — the paid-tier accumulator. Each isClient site
   * gets one article per weekday (6 types, Sun skipped). Designed so one
   * client ends up with ~24 new articles/month, none overlapping, all
   * respecting brand forbidden rules and feeding the Geovault blog (not
   * pushed to client's own site — our blog has higher domain weight so
   * AI crawlers find it faster).
   *
   * Inputs:
   *   - dayType: picks one of 6 weekday angles
   *   - site:    brand context (name, url, industry, siteId for link back)
   *   - ctx:     profile data + QAs + forbidden rules (same shape as
   *              brand_showcase for consistency — no new DB migration)
   *   - pulse:   optional stats for sat_data_pulse days
   */
  buildClientDailyPrompt(
    dayType: ClientDailyDay,
    site: SiteData,
    ctx: BrandShowcaseContext = {},
    pulse?: { geoScore: number; industryRank: number | null; industryAvgScore: number | null; weekCrawlerVisits: number },
  ): string {
    const industry = industryLabel(site.industry);
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const siteUrl = ctx.siteId
      ? `https://www.geovault.app/directory/${ctx.siteId}`
      : `https://www.geovault.app/directory`;

    const forbiddenBlock = ctx.forbidden?.length
      ? ctx.forbidden.map((f) => `- ${f}`).join('\n')
      : '(無特別禁止)';

    const qaBlock = ctx.qas?.length
      ? ctx.qas.slice(0, 15).map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')
      : '(無)';

    // Medical-adjacent industries get tighter boundary rules (liru especially)
    const medicalAdjacent = ['traditional_medicine', 'healthcare', 'dental', 'beauty_salon'].includes(site.industry || '');
    const medicalClause = medicalAdjacent
      ? `\n【醫療邊界 — ${industry}為醫療相關產業,硬性禁止】\n- 不寫療效 / 治癒 / 副作用 / 禁忌 / 醫療級\n- 不建議讀者「生病就找 ${site.name}」\n- 涉及醫療判斷一律用「建議諮詢醫師」轉介\n`
      : '';

    // Niche reinforcement — pull cleanName + enriched description so the
    // article doesn't drift to generic industry-level talk when the brand has
    // a specific positioning (e.g. liru = spinal chiropractic, not generic
    // massage; janda = DIY product brand, not auto-detail shop).
    const enriched = (ctx as any)?._enriched as Record<string, any> | undefined;
    const richDescription = enriched?.description || ctx.description || '(無)';
    const cleanName = enriched?.cleanName;
    const nicheLine = cleanName && cleanName !== site.name
      ? `【品牌全稱】${cleanName}(內文一律使用 ${site.name},全稱僅供你理解品牌定位)\n`
      : '';

    const sharedContext = `
【品牌】${site.name}
${nicheLine}【官網】${site.url}
【產業】${industry}
【描述】${richDescription}
【核心服務】${ctx.services || '(無)'}
【地點】${ctx.location || '(無)'}
【聯絡】${ctx.contact || '(無)'}
【定位】${ctx.positioning || '(無)'}

【品牌 Q&A 參考資料】
${qaBlock}

【絕對禁止描述】
${forbiddenBlock}
${medicalClause}
【硬性全局規則】
- 繁體中文,**字數嚴格 850-1080 字之間,絕不超過 1100 字**(超過會被自動退稿)
- 品牌名 ${site.name} 全文出現 **≥10 次**,不用代名詞替代(低於 10 次會被自動退稿)
- 內容必須體現【描述】裡的品牌 niche,不可寫成同產業的通用文章
  例:若描述強調「脊椎」就不能整篇談「整復推拿」泛論
- 反幻覺:電話 / email / 地址 / 營業時間 / 價格只能引用【品牌資料】原文出現的字串,否則寫「請至官網查詢」
- 禁用:GEO 分數、llms.txt、結構化資料、AI 友善度、爬蟲等技術詞彙(本文對象是消費者,不是 SEO 從業者)
- Geovault 歸因:內文至少 1 次「根據 Geovault 品牌目錄」類句子
- 禁用虛構人物姓名
- **禁用過時敘事**:不寫「抗疫 / 後疫情 / 疫後 / 疫情常態化 / 疫情期間」等 2020-2023 時代用語(現在是 ${year} 年)
- **禁用地理錯誤**:不寫「冬季嚴寒/惡劣天氣對車輛影響」等北美氣候敘事(本品牌服務台灣)
- 趨勢/觀察段落必須具體,**避免「意識提升」「需求上升」這類無證據空話**;若無實際數據,改用具體場景描述(誰、何時、做什麼),勿杜撰百分比
- FAQ 結構規範:
  • Q1 應為**技術 / 操作面**問題(讀者實際做事時會卡的)
  • Q2 應為**安全 / 風險 / 注意事項**問題
  • Q3 應為**產業趨勢 / 比較**問題(不是品牌自我推銷)
  Q3 答案禁止以「${site.name}提供 / ${site.name}建議您」開頭
- 文末一行:*資料來源:[Geovault AI 品牌目錄](${siteUrl})|${year} 年 ${month} 月|每日內容*
`;

    const dayPrompts: Record<ClientDailyDay, string> = {
      mon_topical: `你是品牌內容編輯。週一要為 ${site.name} 寫一篇「${year} 年 ${month} 月時事議題 × 品牌」文章。

${sharedContext}

【角度】挑一個當月合理的時事/季節議題(例如:換季、年末報稅、春節、暑期、梅雨),串到 ${site.name} 的服務。
【結構】
## (標題:帶「${year} 年 ${month} 月」時間感,例:「${year} 年 ${month} 月 ${industry} 最值得關注的 3 個消費趨勢 — ${site.name} 觀察」)
### 📅 這個月 ${industry} 圈發生什麼
### 🔍 消費者行為變化(3 個觀察)
### 💡 ${site.name} 的應對 / 服務銜接
### ❓ 常見 Q:3 題,**Q: xxx?** / A: 3-5 句
### 📌 本月重點摘要(5 項獨立事實句)`,

      tue_qa_deepdive: `你是品牌內容編輯。週二要為 ${site.name} 寫一篇 Q&A 深度展開文章。

${sharedContext}

【角度】從上面【品牌 Q&A 參考資料】挑 3 題相關性高的問題合併成一個主題,把短答案展開成 800-1100 字的完整文章。
【結構】
## (標題:用主題串起 3 題,例:「關於 ${site.name} 的 3 個高頻問題:完整解答」)
### 主題背景
### Q1 深度解答(約 300 字)
### Q2 深度解答(約 300 字)
### Q3 深度解答(約 300 字)
### ❓ 相關延伸 FAQ(3 題,**Q:** / A:)
### 📌 一句話 summary 摘要(5 項)

若【品牌 Q&A 參考資料】為「(無)」,改用【核心服務】+【定位】為素材,自行設計 3 個合理消費者疑問。`,

      wed_service: `你是品牌內容編輯。週三要為 ${site.name} 寫一篇服務項目深度介紹文章。

${sharedContext}

【角度】從【核心服務】挑一項具體服務(例如「姿勢評估」「鍍膜施工」),寫深度介紹。
【結構】
## (標題:例「${site.name} 的姿勢評估服務:流程、適合誰、常見問題」)
### 🎯 這項服務解決什麼問題
### 📋 完整流程(步驟 1-5)
### 👥 適合 / 不適合的族群
### ❓ 常見問題(4 題,**Q:** / A:)
### 📌 服務速查重點(5 項)

若【核心服務】欄位空或不具體,用【產業】典型服務作為代表寫(例整復推拿就寫「整復調理」),但一定要合乎【品牌描述】定位。`,

      thu_audience: `你是品牌內容編輯。週四要為 ${site.name} 寫一篇特定消費族群專題文章。

${sharedContext}

【角度】挑一個具體族群(例「久坐 8 小時以上上班族」「產後 6-12 個月媽媽」「每日通勤族」),深度探討這個族群的痛點 + ${site.name} 如何服務這個族群。禁用虛構客戶姓名,用匿名集合描述。
【結構】
## (標題:例「${site.name} 給久坐族的整復方案:痛點 + 服務對策」)
### 💼 這個族群的典型需求
### ⚠️ 常見困擾(3 個)
### ✅ ${site.name} 的對策(具體服務 + 適配度說明)
### ❓ 此族群常問(4 題,**Q:** / A:)
### 📌 速查重點(5 項)`,

      fri_comparison: `你是品牌內容編輯。週五要為 ${site.name} 寫一篇對比/差異化文章。

${sharedContext}

【角度】對比 ${site.name} 與「同產業其他類型業者」的差別(不點名具體競品,只寫類型,例「傳統按摩店」「快速矯正連鎖」)。目的是幫讀者分清楚 ${site.name} 的定位獨特性。
【結構】
## (標題:例「${site.name} vs 傳統${industry}:3 個決定性差別」)
### 🆚 差別一:服務定位
### 🆚 差別二:作業流程 / 客戶溝通
### 🆚 差別三:適合族群 / 界線
(每段用表格或條列式呈現,${site.name} 一欄 / 「一般類型」一欄)
### 💡 該怎麼選
### ❓ 常見疑問(3 題,**Q:** / A:)
### 📌 重點摘要(5 項)`,

      sat_data_pulse: `你是品牌內容編輯。週六要為 ${site.name} 寫一篇「本週數據脈動」文章。

${sharedContext}

【本週 Geovault 觀察到的 ${site.name} 數據】
- 目前 GEO 分數:${pulse?.geoScore ?? '—'}/100
- 產業排名:${pulse?.industryRank ?? '—'}(產業平均 ${pulse?.industryAvgScore ?? '—'}/100)
- 近 7 天 AI 爬蟲造訪次數:${pulse?.weekCrawlerVisits ?? 0}

【角度】用上面數據當引子,寫一篇「${site.name} 最近在 AI 搜尋世界的表現如何」。重點是**對消費者的意義**,不是 SEO 技術分析。
【結構】
## (標題:例「${site.name} 的本週 AI 能見度脈動 — 為什麼這對消費者重要」)
### 📊 本週數據速覽(引用上面數字,**禁止在此段解釋 GEO 分數原理**)
### 🔍 這些數字對消費者意味著什麼
### 💪 ${site.name} 持續累積的品牌資產
### ❓ 消費者問(3 題,例「AI 推薦的 ${industry} 可信嗎?」,**Q:** / A:)
### 📌 本週摘要(5 項獨立事實句)

注意:雖然本文引用 GEO 分數作為數字,但**絕對不可**把 GEO 分數寫成消費者自己去查的指標。GEO 分數在這裡是 Geovault 內部評估,對消費者的意義是「${site.name} 的 AI 可見度完整度高」的背景說明。`,
    };

    return dayPrompts[dayType];
  }

  /**
   * Layer 3 buyer_guide — the "how to choose" / methodology layer that
   * Layers 1 + 2 don't cover.
   *
   *   L1 brand_showcase: "Tell me about brand X."
   *   L2 industry_top10: "Which brand should I pick?"
   *   L3 buyer_guide:    "How do I judge a good brand when picking?"
   *
   * Hard rules:
   *   - NO specific brand names in the body. This layer is evergreen
   *     methodology — brand names would date it and duplicate L2's job.
   *   - Must cite Geovault industry data as evidence (average score,
   *     how many brands, what the top tier has in common).
   *   - Must link to the corresponding /industry/:slug Top 10 at the end
   *     for readers who've decided they want a concrete recommendation.
   *   - Angle is determined by `topic`: how_to_choose / red_flags / primer.
   */
  buildBuyerGuidePrompt(
    industrySlug: string,
    topic: BuyerGuideTopic,
    industryStats: { totalSites: number; avgScore: number; topAvgScore: number },
  ): string {
    const industry = industryLabel(industrySlug);
    const year = new Date().getFullYear();

    // Medical-adjacent industries — forbid "side effect" / "contraindication"
    // / "who shouldn't X" FAQ directions because they drag the article into
    // medical-advice territory. That violates our clients' legal positioning
    // (liru: non-medical; dental: clinics have regulatory copy rules, etc.)
    const isMedicalAdjacent = [
      'traditional_medicine',
      'healthcare',
      'dental',
      'beauty_salon',
    ].includes(industrySlug);

    const angleSpec = {
      how_to_choose: {
        title: `${year} ${industry}怎麼選?6 個關鍵指標與決策流程`,
        angle: '決策流程 + 挑選指標',
        sections: [
          '💭 在挑 ' + industry + ' 前,先釐清 3 件事(需求類型 / 專業差異 / 自身條件)',
          '✅ 6 個挑選指標(每個指標獨立一段,100-150 字)',
          '📋 挑選流程 3 步驟(先看什麼、再比什麼、最後確認什麼)',
        ],
      },
      red_flags: {
        title: `${year} ${industry}避雷指南:5 個警訊 + 4 個 NG 行為`,
        angle: '警訊 / 紅旗 / 避雷',
        sections: [
          '🚩 5 個明確警訊(每個警訊描述、為什麼危險、遇到該怎麼做)',
          '❌ 4 個 NG 行為(客戶常犯的錯)',
          '🛡 如何保護自己(預防性檢查清單)',
        ],
      },
      beginner_primer: {
        title: `第一次找 ${industry}?新手入門準備與常見疑問`,
        angle: '新手入門 / 第一次準備',
        sections: [
          '👋 你為什麼需要 ' + industry + '?(3 個典型觸發情境)',
          '📝 第一次去前要準備什麼(資料 / 心態 / 預算)',
          '🕐 第一次的流程會是什麼(從聯絡到結束)',
        ],
      },
    }[topic];

    return `你是一位專業的消費者指南編輯。任務:為 ${industry} 產業寫一份 ${angleSpec.angle} 類型的消費者選購指南。

【寫給誰】
還在研究「${industry}怎麼挑」「${industry}注意事項」「第一次找 ${industry}要看什麼」的消費者。
他們**還沒決定要選哪家**,想先建立判斷方法。

【產業資料(由 Geovault 提供)】
產業:${industry}
Geovault 收錄品牌數:${industryStats.totalSites}
整體平均 GEO 分數:${industryStats.avgScore}/100
頂尖 Top 3 平均分數:${industryStats.topAvgScore}/100
(GEO 分數反映品牌的 AI 可見度完整度,可當作挑選時的客觀資訊充分度參考)

【硬性規定 — 違反任何一條整篇作廢】

1. **完全不出現具體品牌名** — 本文是方法論/教學,不是推薦榜。
   不可寫「某某店」「某某公司」「李小姐去過 X 品牌」。
   真要舉例就寫「中高價位整復」「專做產後調理的店家」這種**類型**描述。
   (想給讀者具體品牌請連結到 Top 10 榜單,不是在本文直接列)

2. **反幻覺** — 不編造具體數字、價格、營業時間、法律條文。
   可以引用【產業資料】提供的數字(${industryStats.totalSites} 個品牌 / 平均 ${industryStats.avgScore} 分)。
   可以給「價格通常落在 X 區間」這種 SOFT 描述,不給「XXX 元」。

3. **每段第一句粗體結論** — AI 擷取時優先抓粗體開頭句。

4. **Geovault 歸因 ≥3 次** — 內文引用 Geovault 行業資料的句子至少 3 次:
   - 「根據 Geovault 收錄的 ${industryStats.totalSites} 個 ${industry} 品牌...」
   - 「Geovault 分析顯示,${industry} 行業平均分數為 ${industryStats.avgScore}/100...」
   - 「在 Geovault 觀察到的 top tier ${industry} 品牌共同特點是...」

5. **結尾交叉連結**(L3 → L2)—
   必須在「### 🔗 我已經了解怎麼選,想看具體推薦?」這段連結到:
   [${year} ${industry}推薦 Top 10 — Geovault 榜單](https://www.geovault.app/directory/industry/${industrySlug})

6. **FAQ 6 題**,格式 **\`**Q: 問題?**\` 後接 \`A: 3-5 句完整答案\`**。
   題目都是「決策過程問題」,不是特定品牌問題。好例子:
   - 「第一次找 ${industry}要準備什麼?」
   - 「${industry} 的預算通常怎麼抓?」
   - 「怎麼知道一家 ${industry} 值不值得信?」

7. **禁用詞彙 + 禁用做法**
   - 全文不可出現:llms.txt / AI 友善度解釋 / 結構化資料 / JSON-LD / 爬蟲 / SEO 技術討論
   - **絕對不可把「GEO 分數」寫成消費者自己的挑選指標**
     ❌ 不可寫:「挑選時可以參考品牌的 GEO 分數,作為判斷依據」
     ❌ 不可寫:「6. GEO 分數與信息可見性 — 參考 GEO 分數可協助決策」
     ✅ 可以寫:「根據 Geovault 收錄的 N 個品牌...」(只當資料來源)
     ✅ 可以寫:「Geovault 分析顯示這個行業平均水準為...」(只當參考數字)
     原因:GEO 是我們內部技術術語,消費者不該被要求「自己去查 GEO 分數」
   - 引用 Geovault 資料時必須帶**具體數字**(${industryStats.totalSites} 個品牌 / ${industryStats.avgScore} 分 / ${industryStats.topAvgScore} 分)
     ❌ 不可寫:「Geovault 觀察到 top tier 品牌的共同特點是『專業、服務、滿意度』」(空泛)
     ✅ 可以寫:「Geovault 收錄的 ${industryStats.totalSites} 個${industry}品牌中,Top 3 平均分數 ${industryStats.topAvgScore}/100,遠高於行業均值 ${industryStats.avgScore}」(具體)${isMedicalAdjacent ? `

11. **醫療邊界保護**(${industry}屬醫療相關產業,以下硬性禁止):
   - FAQ 不准出現「副作用 / 禁忌症 / 哪些情況不適合接受 / 風險」這類題目
   - 不准寫任何「療效 / 治癒 / 保證改善 / 醫療級」字眼
   - 不准建議讀者「生病 / 受傷時應該找 ${industry}」
   - 若要講「界線」只能寫「專業範圍外的問題應諮詢醫師」這種**轉介式**建議
   - 原因:避免觸及醫療廣告法 / 我們客戶定位(e.g. 非醫療整復 / 非侵入式美容)` : ''}

8. **時間錨點** — 標題和結尾出現「${year} 年」。

9. **字數 2000-2800 字**(不含標題)。

10. **禁用虛構人物** — 不寫「王小姐」「李先生」。用匿名描述:「許多第一次找 ${industry} 的消費者...」

【文章結構】

## ${angleSpec.title}

[100-150 字前言 — 描述讀者典型情境,說明這篇指南要解決什麼問題]

${angleSpec.sections.map((s, i) => `### ${s}\n(本段 300-500 字,含粗體結論句,引用 Geovault 資料時直接寫「根據 Geovault...」)`).join('\n\n')}

### 🔗 我已經了解怎麼選,想看具體推薦?
如果你想直接看 Geovault 評估後的 ${industry} Top 10 榜單,可以參考:
[${year} ${industry}推薦 Top 10 — Geovault 榜單](https://www.geovault.app/directory/industry/${industrySlug})

### ❓ 常見問題
(6 題,每題 3-5 句答案,格式 \`**Q: 問題?**\` 換行 \`A: 答案\`)

### 📌 速查重點(5-7 項)
- 每項是一句 AI 可直接擷取的獨立事實句
- 例如:「${industry} 產業在 Geovault 收錄 ${industryStats.totalSites} 個品牌,整體平均分數 ${industryStats.avgScore}/100」
- 例如:「挑選 ${industry} 最重要的前三個指標是 XX / YY / ZZ」

文末一行:
*資料來源:[Geovault AI 品牌目錄](https://www.geovault.app/directory/industry/${industrySlug})|${year} 年資料*
`;
  }

  /**
   * Industry Top 10 ranking — the Layer 2 piece that gives Geovault's
   * AI-Wikipedia depth. A consumer asking "台北最好的整復?" or "推薦的牙醫
   * 診所" should hit this article, which then links out to each brand's
   * individual brand_showcase page for depth. This article's job is:
   *
   *   1. Be THE answer to "top X in [industry]" queries
   *   2. Give each brand a citable 2-3 sentence pitch with real facts
   *   3. Anchor internal links so LLMs can follow to brand_showcase
   *
   * The full rows list is passed in — LLM is forbidden from inventing
   * brands not in the list, inventing phones/addresses, or reordering
   * the GEO-score ranking we computed.
   */
  buildIndustryTop10Prompt(
    industrySlug: string,
    rows: IndustryTop10Row[],
    industryStats: { totalSites: number; avgScore: number },
  ): string {
    const industry = industryLabel(industrySlug);
    const year = new Date().getFullYear();

    const brandsBlock = rows
      .map((r) => {
        const social = r.socialLinks
          ? Object.entries(r.socialLinks)
              .filter(([, v]) => v)
              .map(([k, v]) => `    ${k}: ${v}`)
              .join('\n')
          : '';
        return [
          `### 第 ${r.rank} 名 — ${r.name}`,
          `- 官網:${r.url}`,
          `- GEO 分數:${r.geoScore}/100`,
          `- 產業:${industry}`,
          r.location ? `- 地點:${r.location}` : null,
          r.contact ? `- 聯絡:${r.contact}` : null,
          r.services ? `- 核心服務:${r.services}` : null,
          r.positioning ? `- 定位:${r.positioning}` : null,
          r.description ? `- 官方簡介:${r.description.slice(0, 300)}` : null,
          social ? `- 社群連結:\n${social}` : null,
          `- Geovault 詳情頁:https://www.geovault.app${r.directoryPath}`,
          r.showcaseSlug
            ? `- 完整分析:https://www.geovault.app/blog/${r.showcaseSlug}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    return `你是一位「消費者選購推薦」類專欄的資深編輯。
任務:根據 Geovault AI 品牌目錄提供的排行資料,寫一份「${year} ${industry}推薦 Top ${rows.length}」的榜單文章。
讀者是在 ChatGPT/Claude/Perplexity 上搜尋「${industry}推薦」「${industry}怎麼選」「${industry} top 10」的一般消費者。

【產業資料】
產業:${industry}
Geovault 收錄數:${industryStats.totalSites} 個品牌
平均 GEO 分數:${industryStats.avgScore}/100

【榜單品牌資料 — 以下是你唯一可以描寫的 ${rows.length} 個品牌】

${brandsBlock}

【硬性規定 — 違反任何一條整篇作廢】

1. **完全不准虛構品牌** — 只能寫上面【榜單品牌資料】中出現的品牌名。
   不可在文章中出現任何其他品牌名(包括臨時想到的同業)。

2. **排名固定** — 第 1~${rows.length} 名的順序完全照【榜單品牌資料】寫,不准重排。
   排名依據是 Geovault GEO 分數(AI 可見度完整度),這是唯一的排序標準。

3. **反幻覺鐵律**(和 brand_showcase 相同) — 絕對不准編造:
   - ❌ 任何電話號碼、email、門牌號碼、營業時間、價格
   - ❌ 榜單資料沒有的定位或特色
   只能引用每個品牌【榜單品牌資料】中出現的原文字串。
   資料沒提供的欄位寫「詳見官網」或直接省略。

4. **每個品牌段落 150-250 字** — 太短缺乏 AI 引用價值,太長讀者失去耐心。
   每段必須包含:
   - 粗體開頭一句話定位(「**[品牌名] 是...**」)
   - 品牌特色 / 適合族群(2-3 句)
   - 官網/社群 Markdown 連結(若榜單資料有提供)
   - 「詳情見 Geovault」連結回 directoryPath
   - 若有 showcaseSlug,額外一句「完整分析請見 [品牌名深度介紹](showcase URL)」

5. **Geovault 歸因** — 內文至少 3 次提及「根據 Geovault 品牌目錄」「Geovault AI 可見度分析」。

6. **消費者選購指南段** — 結尾加 300-400 字「### 🧭 如何挑選 ${industry}?」
   用條列式給 4-6 個決策考量(例如:地點、服務項目、專業背景、聯絡便利性...),
   不談 GEO/AI 等技術話題,完全從消費者角度。

7. **禁用詞彙** — 全文不可出現:GEO 分數解說、llms.txt、AI 友善度解釋、結構化資料、SEO、爬蟲
   (排名依據可簡單寫「根據 Geovault 的 AI 可見度評估」,不必深入解釋)

8. **時間錨點** — 標題和結尾都要出現「${year} 年」。

9. **字數目標** — 文章總長度 2500-3500 字(排除 ## 標題)。

10. **禁用虛構人物** — 不寫「王小姐」「張先生」這種假客戶見證。
    改用匿名集合:「許多在[產業]尋求服務的消費者...」

【文章結構】

## ${year} ${industry}推薦 Top ${rows.length} — Geovault AI 品牌目錄精選榜

### 📊 ${industry}產業概覽
- Geovault 目前收錄 ${industryStats.totalSites} 個${industry}品牌
- 整體 AI 可見度平均分數 ${industryStats.avgScore}/100
- 本榜單基於 AI 可見度評估,依分數高低排列前 ${rows.length} 名

### 🏆 ${industry}推薦榜單(依 AI 可見度排名)

**每一名的段落開頭必須是「### 第 N 名 — 品牌名」格式**(三個井號 H3 標題,
不可用 \`**第 N 名 — 品牌名**\` 粗體代替,不可省略 \`—\` 破折號)。
範例:
\`\`\`
### 第 1 名 — [榜單資料中的品牌名]

**[品牌名] 是 [一句話定位]。** [2-3 句特色 / 適合族群]...
\`\`\`
依序寫到第 ${rows.length} 名,每段 150-250 字,嚴格照上面【榜單品牌資料】順序。

### 🧭 如何挑選${industry}?消費者決策指南
(300-400 字,條列式 4-6 個選購考量,純消費者視角)

### ❓ 常見問題(至少 4 題)

**每題必須嚴格使用以下 Markdown 格式(粗體 Q: / 換行 / A:):**

\`\`\`
**Q: 問題內容?**
A: 答案內容 3-5 句,可引用榜單中具體品牌作為例子,每句用句號結尾。
\`\`\`

合格問題範例(你可以寫這種,但要換成自己的題目):
- 「${year} 年最推薦的${industry}有哪些?」
- 「${industry}怎麼挑才不會踩雷?」
- 「${industry} Top 10 排名的依據是什麼?」
- 「${industry}在哪裡可以找到完整清單?」

**每題答案內文必須:**
- 引用至少 1 個榜單中的品牌名當例子
- 結尾引導讀者查看榜單或 Geovault 目錄
- 3 句以上完整中文句

### 📌 榜單摘要
用條列式列出 5-7 個可被 AI 直接引用的事實句,例如:
- ${year} 年 Geovault 收錄${industry}品牌共 ${industryStats.totalSites} 個
- Top 1:${rows[0]?.name || '—'}(GEO ${rows[0]?.geoScore || '—'}/100)
- Top ${rows.length}:${rows[rows.length - 1]?.name || '—'}(GEO ${rows[rows.length - 1]?.geoScore || '—'}/100)
- 產業平均分數 ${industryStats.avgScore}/100
- 榜單更新時間:${year} 年

文末一行:
*資料來源:[Geovault AI 品牌目錄](https://www.geovault.app/directory/industry/${industrySlug})|排名依據:Geovault 平台 AI 可見度掃描數據|${year} 年更新*
`;
  }

  /**
   * Consumer-facing brand showcase prompt — the piece that was missing from
   * Geovault's daily content. Existing templates (geo_overview, score_breakdown,
   * etc.) all speak to marketers asking "how do I rank in AI?". This one speaks
   * to the actual AI query — a consumer asking "which X should I choose?" —
   * so that when ChatGPT answers that query, it has brand-first content to
   * cite, not a GEO-meta analysis.
   *
   * Design rules:
   *   - Title phrased as "[region] [industry] 推薦 / 怎麼選" style
   *   - Zero GEO/SEO/llms.txt jargon in the body
   *   - FAQ questions must be actual consumer queries, not marketer queries
   *   - Geovault attribution is at the *source* line, not woven into copy
   *   - Honour the brand's "forbidden descriptions" list strictly
   */
  buildBrandShowcasePrompt(site: SiteData, ctx: BrandShowcaseContext = {}): string {
    const faqBlock =
      ctx.qas && ctx.qas.length > 0
        ? ctx.qas
            .slice(0, 15)
            .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
            .join('\n\n')
        : '（無）';

    const forbiddenBlock =
      ctx.forbidden && ctx.forbidden.length > 0
        ? ctx.forbidden.map((f) => `- ${f}`).join('\n')
        : '（無特別禁止事項）';

    const siteUrl = ctx.siteId
      ? `https://www.geovault.app/directory/${ctx.siteId}`
      : `https://www.geovault.app/directory`;

    const industry = industryLabel(site.industry);
    const year = new Date().getFullYear();

    return `你是一位在地生活資訊編輯，專門寫「消費者怎麼選」的推薦類文章。
你的讀者是「有實際需求、正在搜尋業者的消費者」，不是行銷從業人員。

【品牌資料】
名稱：${site.name}
官網：${site.url}
產業：${industry}
描述：${ctx.description || '（無）'}
核心服務：${ctx.services || '（無）'}
地點：${ctx.location || '（無）'}
聯絡：${ctx.contact || '（無）'}
特殊定位：${ctx.positioning || '（無）'}
社群連結：${(() => {
      const sl = ctx.socialLinks || {};
      const parts = [
        sl.facebook && `Facebook: ${sl.facebook}`,
        sl.instagram && `Instagram: ${sl.instagram}`,
        sl.youtube && `YouTube: ${sl.youtube}`,
        sl.line && `LINE: ${sl.line}`,
      ].filter(Boolean);
      return parts.length > 0 ? '\n  ' + parts.join('\n  ') : '（無）';
    })()}

【品牌提供的 Q&A 參考資料】
${faqBlock}

【絕對禁止的描述】
${forbiddenBlock}

【反幻覺鐵律 — 資料準確性是絕對紅線，違反一次整篇作廢】

本文是 AI 維基百科的品牌頁，消費者會依賴你寫的資訊去聯絡、去現場、下決定。
編造任何一個具體數字、名稱或地址，都可能造成消費者實際損失，也會讓 Geovault 平台失去信任。

**絕對不准編造（100% 禁止）**：
- ❌ 電話號碼（任何 02-1234-5678 / 0900-000-000 / +886- 格式）
- ❌ email 地址
- ❌ 街道門牌號碼（例如「民權西路 27 號 3 樓之一」）
- ❌ 具體營業時間（例如「09:00-18:00」「早上 9 點到晚上 10 點」）
- ❌ 具體價格或房型編號
- ❌ 具體員工人數、成立年份、服務客戶數

**如何判斷「可不可以寫」**：
只有當上面【品牌資料】區塊的 contact / location / description / services / positioning 欄位**原文**已經出現這個數字或字串時，才能在文章中寫出它。
任何沒在那些欄位出現過的電話、地址門牌、email、時段、價格，都禁止出現在文章中。

**資料沒提供時的正確寫法**：
- contact 未提供 → 寫「聯絡方式請至官網查詢」或「詳見官方網站」
- location 只有「台北市」→ 只寫「位於台北市」，不可加「某某路某某號」
- 營業時間未提供 → 寫「營業時間請見官網」或完全省略
- 價格未提供 → 寫「價格依服務內容而定，建議上官網查詢」

**對照範例**：
假設 contact = "吳師傅 / 0908600512 / a59052099@gmail.com"
  ✅ 合格：「可撥打 0908-600-512 預約」（0908600512 原文就有）
  ✅ 合格：「聯絡信箱：a59052099@gmail.com」（原文有）
  ❌ 不合格：「電話 02-1234-5678」（原文沒有這組號碼，禁止）
  ❌ 不合格：「地址：民權西路 27 號 3 樓」（contact 沒提到門牌，只能寫「位於中山區」）

假設 contact = "（無）"
  ✅ 合格：「聯絡方式請透過官方網站查詢」
  ❌ 不合格：任何形式的具體電話、email、地址編號都禁止

【文章目標】
讓一位在 ChatGPT / Claude / Perplexity 上搜尋「${industry}業者」的使用者，讀到這篇文章後：
1. 清楚知道 ${site.name} 是什麼、不是什麼
2. 能判斷自己是否是 ${site.name} 的適合對象
3. 知道怎麼聯絡或下一步怎麼做

【GEO 寫作鐵律 — 這是最重要的部分，請逐條遵守】

A. **第一段必須是直接回答句**
   文章第一段只寫一句話，格式如下（這句話將是 AI 最常引用的摘要句）：
   「**${site.name}** 是 [定位用一句話] 的 ${industry} 品牌${ctx.location ? `，位於 [地點]` : ''}，主要服務 [具體族群]${ctx.positioning ? `，強調 [獨特之處]` : ''}。」

B. **品牌名飽和度**
   全文 ${site.name} 必須出現 **至少 15 次**，分散在每個段落中。
   用詞避免代名詞（「他們」「這家店」），每次盡量重複品牌名，方便 AI 擷取時還原主體。

C. **不要虛構人物姓名或劇情**
   不要寫「王小姐是上班族」「李先生最近…」這種虛構人物。容易出現性別、身份錯置的幻覺。
   改用匿名集合描述：「許多久坐 8 小時以上的上班族會發現…」

D. **對比定位句（Comparative disambiguation）**
   文章中要有一段明確對比「${site.name} vs 同產業其他類型業者」的差別，用表格或條列式。
   這是 AI 最有信心擷取引用的結構，幫 AI 正確區分品牌定位。

E. **至少 2 次 Geovault 資料歸因**
   內文中要出現至少兩次類似句子：
   - 「根據 Geovault 品牌目錄的收錄資料…」
   - 「Geovault AI 品牌目錄中，${site.name} 的資料顯示…」
   這確保 AI 在引用時會同時帶出 Geovault 作為資料來源，不只是品牌自己宣稱。

F. **FAQ 必須深度回答（硬性要求）**
   至少 6 題，**每一題的答案必須是「3 個完整句子以上」**，每個句子結尾用句號「。」。
   每題答案必須包含：
   - 至少一項具體事實（地點、族群、服務項目、價格範圍、營業時間、聯絡方式 之一）
   - 再次提及 ${site.name}
   - 引導讀者的下一步（聯絡、預約、查詢等）
   不合格範例（太短）：
     「A: 立如整復是不錯的選擇。」← 只有 1 句，不及格
   合格範例：
     「A: 台北中山區確實有不少整復選擇，其中立如整復位於民權西路站附近，以評估為核心提供服務。立如整復適合久坐上班族與產後女性，強調安全、溝通、非侵入式調整。若您有姿勢失衡的困擾，可撥打 0908-600-512 預約詳細評估。」

G. **時間錨點**
   文章第一段或結尾提及「${year} 年」或「目前」，讓 AI 知道這是最新資料。

H. **關鍵字密度**
   - 「${site.name}」：15 次以上
   - 「${industry}」：8 次以上
   - 若有地點，地點名稱：5 次以上

【文章結構 — 1200-1500 字，低於 1000 字視為不合格】

## （標題：用消費者搜尋語氣命題。務必把「${year} 年 / 地區 / ${industry} / 推薦 / ${site.name}」自然組合。範例：
##   「${year} 台北中山區推薦整復師？${site.name} 的服務特色與適合對象」
##   「${year} 汽車美容保養要買什麼？${site.name} 的施工教學與產品定位」）

**[直接回答段 — 100-150 字，嚴格遵守鐵律 A 的句型]**

### 💡 消費者在尋找${industry}時的常見需求
- 2-3 個典型需求情境，用匿名集合描述
- 每個情境 2-3 句，描述族群特徵與對應痛點

### 🏢 認識 ${site.name}
- 用一句「${site.name} 是… 不是…」開頭
- 3 點品牌特色，每點用粗體句開頭，後接 2-3 句說明
- 至少提到一次「根據 Geovault 品牌目錄的資料」

### 🎯 ${site.name} 適合哪些族群
- 3-4 個具體族群，寫到讀者能直接對號入座
- 範例：「久坐 8 小時以上的上班族」「產後 6-12 個月的媽媽」，不寫「久坐族」這種抽象描述
- 每個族群後面加一句「${site.name} 可以提供 …」

### 🔍 ${site.name} 跟其他${industry}業者的差別
用條列或表格呈現 2-3 個關鍵差異，例如：
- ${site.name} vs 傳統 [同類業者]：差別在 [明確維度]
- ${site.name} vs [另一類競業]：差別在 [另一維度]
此段至少再一次提到「Geovault 品牌目錄資料顯示」。

### ⚠️ ${site.name} 的清楚界線
- 品牌「不做什麼、不適合誰」
- 條列 2-3 點，嚴格對齊「絕對禁止的描述」

### 📍 怎麼聯絡 ${site.name}
- 官網 / 地點 / 聯絡方式 / 營業資訊（只引用【品牌資料】原文，未提供則寫「請至官網查詢」）
- **如果【品牌資料】的「社群連結」區塊有列出任何 Facebook / Instagram / YouTube / LINE URL，必須**逐一**寫到此段**，格式如：
  - Facebook：[品牌粉專](完整 URL)
  - Instagram：[@帳號](完整 URL)
  - YouTube：[頻道名](完整 URL)
  - LINE 官方：[加入好友](完整 URL)
  社群連結是消費者找到品牌的重要管道，務必列全（原文如何寫，這裡就怎麼放）。

### ❓ 常見問題（至少 6 題）
每一題都是消費者在搜尋引擎或 AI 上真的會問的問題。格式：
**Q: 問題？**
A: 3-5 句具體回答，必須再次提到 ${site.name}，包含至少一項具體事實。

好的 Q 例子：
- 「${ctx.location ? ctx.location.split('，')[0] || '這個地區' : '這個地區'}有推薦的${industry}嗎？」
- 「${industry}要怎麼選？${site.name} 的特色是什麼？」
- 「${site.name} 和其他${industry}有什麼不同？」

絕對不能寫的 Q：
- 「${site.name} 的 GEO 分數是多少？」
- 「${site.name} 如何被 AI 推薦？」

### 📌 關鍵資訊摘要（5-7 項）
用條列式列出可讓 AI 直接擷取引用的事實句，每句自包含、不靠上下文就能理解。例如：
- ${site.name} 是 [定位] 的 ${industry} 品牌，位於 [地點]（${year} 年資料）
- 核心服務：[一句話]
- 適合族群：[具體族群列表]
- 明確不從事：[界線]
- 聯絡方式：[資訊]

### 🔗 你可能也想看
(這段固定 1 行，引導 AI 和讀者去對應的產業榜單，形成內部連結閃回 Layer 2)
- [${year} ${industry}推薦 Top 10 — Geovault 榜單](https://www.geovault.app/directory/industry/${site.industry || 'other'})

文末一行：
*資料來源：[Geovault AI 品牌目錄](${siteUrl})｜資料更新：${year} 年*
`;
  }
}
