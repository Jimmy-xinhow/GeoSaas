export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readTime: string;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'what-is-geo',
    title: '什麼是 GEO？為什麼你的品牌需要它',
    description: 'GEO（Generative Engine Optimization）是讓 AI 搜尋引擎主動推薦你品牌的新一代 SEO 策略。本文深入解析 GEO 的核心概念與實作方法。',
    date: '2026-03-15',
    category: '入門教學',
    readTime: '5 分鐘',
    content: `
## 什麼是 GEO？

GEO（Generative Engine Optimization）是一種新興的搜尋引擎優化策略，專門針對 AI 驅動的搜尋引擎進行優化。與傳統 SEO 不同，GEO 的目標是讓 ChatGPT、Claude、Perplexity、Copilot 等 AI 工具在回答用戶問題時，主動推薦並引用你的品牌。

## 為什麼 GEO 很重要？

隨著越來越多用戶使用 AI 工具搜尋資訊，傳統搜尋引擎的流量正在被分流。如果你的品牌無法被 AI 工具「看見」，你可能會失去大量潛在客戶。

### GEO 的核心要素

1. **結構化資料（JSON-LD）** — 讓 AI 理解你的網站內容
2. **llms.txt** — 直接告訴 AI 爬蟲你的品牌資訊
3. **FAQ Schema** — 提供 AI 可以引用的問答內容
4. **高品質內容** — 具有權威性和引用價值的內容

## 如何開始？

使用 Geovault 平台，你可以免費掃描你的網站，獲得 AI 友善度分數，並根據建議逐步優化。
    `.trim(),
  },
  {
    slug: 'llms-txt-guide',
    title: '完整指南：如何設定 llms.txt 讓 AI 找到你',
    description: 'llms.txt 是一個專為 AI 爬蟲設計的檔案，類似 robots.txt。本文教你如何建立和部署 llms.txt。',
    date: '2026-03-10',
    category: '技術指南',
    readTime: '8 分鐘',
    content: `
## 什麼是 llms.txt？

llms.txt 是一個放在網站根目錄的純文字檔案，專門為大型語言模型（LLM）爬蟲提供資訊。它的功能類似 robots.txt，但目標是幫助 AI 理解你的網站。

## llms.txt 的格式

\`\`\`text
# 品牌名稱
> 一句話描述你的品牌

## 核心資訊
- 官方網站：https://example.com
- 產品類別：SaaS / 科技 / 電商
- 成立年份：2020

## 常見問題
- Q: 你們提供什麼服務？
  A: 我們提供 AI SEO 優化平台...

## 聯絡方式
- Email: hello@example.com
\`\`\`

## 如何部署

1. 在 Geovault 平台自動生成 llms.txt
2. 下載或使用我們的免費託管服務
3. 放到你網站的根目錄下
4. 驗證：訪問 https://your-site.com/llms.txt
    `.trim(),
  },
  {
    slug: 'json-ld-for-ai',
    title: 'JSON-LD 結構化資料：AI 時代的必備 SEO 技術',
    description: '深入了解 JSON-LD 結構化資料如何幫助 AI 搜尋引擎理解你的網站內容，提升 AI 引用機率。',
    date: '2026-03-05',
    category: '技術指南',
    readTime: '6 分鐘',
    content: `
## 為什麼 JSON-LD 對 AI SEO 很重要？

JSON-LD（JavaScript Object Notation for Linked Data）是一種結構化資料格式，幫助搜尋引擎和 AI 工具理解你網頁上的內容。Google 官方推薦使用 JSON-LD 格式。

## 常用的 Schema 類型

### Organization Schema
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "你的品牌名稱",
  "url": "https://example.com",
  "description": "品牌描述"
}
\`\`\`

### FAQPage Schema
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "問題？",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "回答..."
    }
  }]
}
\`\`\`

## 使用 Geovault 自動生成

Geovault 可以根據你的網站內容自動生成合適的 JSON-LD 程式碼，一鍵複製即可使用。
    `.trim(),
  },
  {
    slug: 'ai-crawler-tracking',
    title: '如何追蹤 AI 爬蟲造訪你的網站',
    description: '了解 GPTBot、ClaudeBot 等 AI 爬蟲的運作方式，以及如何監控它們對你網站的造訪行為。',
    date: '2026-02-28',
    category: 'AI 趨勢',
    readTime: '4 分鐘',
    content: `
## AI 爬蟲有哪些？

目前主要的 AI 爬蟲包括：

| 爬蟲名稱 | 組織 | 用途 |
|---------|------|------|
| GPTBot | OpenAI | 訓練和搜尋 |
| ClaudeBot | Anthropic | 搜尋和引用 |
| PerplexityBot | Perplexity | 即時搜尋 |
| Google-Extended | Google | Gemini 訓練 |
| Bytespider | ByteDance | TikTok AI |

## 為什麼要追蹤？

- 了解哪些 AI 正在爬取你的內容
- 確認你的網站是否被 AI 發現
- 優化 robots.txt 設定
- 追蹤優化效果

## 如何追蹤

Geovault 提供 JavaScript 追蹤碼，安裝後即可即時監控所有 AI 爬蟲的造訪行為。
    `.trim(),
  },
  {
    slug: 'geo-vs-seo',
    title: 'GEO vs SEO：AI 時代的搜尋優化該怎麼做？',
    description: '比較傳統 SEO 與新興 GEO 的差異，以及如何同時兼顧兩者來最大化你的線上曝光。',
    date: '2026-02-20',
    category: 'AI 趨勢',
    readTime: '7 分鐘',
    content: `
## SEO 與 GEO 的核心差異

| 項目 | SEO | GEO |
|------|-----|-----|
| 目標 | Google 搜尋排名 | AI 工具推薦 |
| 指標 | 關鍵字排名、流量 | AI 引用率、能見度 |
| 技術重點 | 反向連結、網頁速度 | 結構化資料、llms.txt |
| 內容策略 | 關鍵字優化 | 品牌權威性、問答內容 |

## 兩者如何互補？

好消息是，GEO 和 SEO 並不互斥。事實上，做好 GEO 往往也能提升 SEO 表現：

1. 結構化資料同時幫助 Google 和 AI 理解你的內容
2. 高品質的 FAQ 內容對兩者都有正面影響
3. 品牌權威性是所有搜尋引擎的共同評估標準

## 建議策略

先用 Geovault 掃描你的網站，找出需要改進的地方，然後同時優化 SEO 和 GEO。
    `.trim(),
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...blogPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
