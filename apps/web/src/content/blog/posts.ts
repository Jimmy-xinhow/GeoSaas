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
    description: 'GEO 是改善內容可被搜尋、理解與引用條件的工作方法，但不保證任何 AI 平台推薦。本文說明它與 SEO、技術準備度及引用驗收的關係。',
    date: '2026-08-12',
    category: '入門教學',
    readTime: '5 分鐘',
    content: `
## 什麼是 GEO？

GEO（Generative Engine Optimization）可以理解為一套內容與技術工作方法：讓公開資料更容易被搜尋系統抓取、理解、核對與引用。它可能改善品牌進入 AI 回答候選資料的條件，但不保證 ChatGPT、Claude、Perplexity、Gemini、Copilot 或任何搜尋平台一定提及、排名或推薦某個品牌。

傳統 SEO 的核心是讓網頁出現在搜尋結果頁，使用者再自行點擊、比較與判斷。GEO 面對的是另一種使用情境：使用者直接問 AI「哪一家適合我」、「這個問題要找誰處理」、「某個產業有哪些推薦品牌」。AI 在回答時會先整理可讀資料，再把少數品牌放進答案中。因此，品牌網站必須提供清楚、可驗證、可被摘要的內容。

換句話說，GEO 不只是增加關鍵字密度，而是讓 AI 能理解你的品牌是誰、服務什麼族群、解決什麼問題、有哪些可信證據，以及使用者在什麼情境下應該選擇你。

## 為什麼 GEO 很重要？

隨著越來越多用戶使用 AI 工具搜尋資訊，傳統搜尋引擎的流量正在被分流。如果你的品牌無法被 AI 工具「看見」，你可能會失去大量潛在客戶。

這種變化對在地服務、專業顧問、醫療美容、教育、餐飲、旅宿、電商與 B2B SaaS 都有直接影響。過去使用者可能會搜尋多個關鍵字、打開十幾個網站，再慢慢比較。現在使用者可能只問 AI：「台北適合新手的健身房有哪些？」或「哪個工具適合做 AI SEO？」如果 AI 的答案沒有你的品牌，你就不在這次決策流程裡。

AI 回答中的品牌提及必須另外驗收。平台顯示品牌名稱、附上來源連結，或只是重述沒有出處的資訊，代表不同層級的證據，不能只憑網站技術分數推定成效。

### GEO 的核心要素

1. **可索引的 HTML 與穩定網址** — 先確保搜尋系統能抓取主要內容
2. **清楚、可核對的品牌事實** — 服務、地區、資格、流程與限制要具體
3. **結構化資料（JSON-LD）** — 與頁面可見內容一致，協助理解實體
4. **有來源的原創內容** — 回答真實問題，避免只改寫其他網站
5. **實際引用驗收** — 用固定問題集記錄平台、日期、回答與來源連結

除了這四項，也建議補齊品牌介紹、服務區域、聯絡方式、成功案例、價格或流程說明、常見問題與專業證據。這些內容應該使用清楚的標題與段落，而不是只放在圖片或複雜動畫裡。AI 爬蟲越容易讀取，模型越容易把品牌放進正確分類。

llms.txt 可以作為額外的內容索引，但它仍是自願性提案，不是 robots.txt，也不應取代可索引 HTML、sitemap 或站內連結。Google 明確表示其搜尋系統不使用 llms.txt；因此 Geovault 只把它列為低權重、選用的技術訊號。

GEO 的另一個重點是一致性。官網、公開目錄、社群資料與結構化資料應傳遞可互相核對的品牌事實。不同頁面若對服務範圍、資格或地址說法矛盾，搜尋系統就更難判斷哪一個版本可信。

## 如何開始？

使用 Geovault 掃描時，你取得的是「GEO 技術準備度分數」：它檢查九項網站訊號的完整度，不是 Google 或 AI 平台公布的排名分數，也不是引用機率。

第一步是檢查網站能否被正常抓取與索引，並確認標題、描述、正文、聯絡資訊和主要服務頁完整。第二步是補上與頁面一致的 JSON-LD、FAQ、Open Graph 與圖片替代文字；核心工作完成後，再決定是否提供 llms.txt。第三步是用固定問題集定期測試真實提問，分開記錄「有提及」「有來源連結」「來源是官網」三種結果。

如果 AI 還沒有引用你，先不要只追求更多文章，而要回頭檢查內容是否足夠具體、可索引且有第一手證據。可延伸閱讀 [Google 的 AI 搜尋內容指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) 與本站的 [GEO vs SEO 實作框架](/blog/geo-vs-seo)。
    `.trim(),
  },
  {
    slug: 'llms-txt-guide',
    title: '完整指南：如何設定 llms.txt 讓 AI 找到你',
    description: 'llms.txt 是仍在發展中的自願性內容索引提案，不是 robots.txt，也不保證收錄或引用。本文說明正確定位、格式與部署順序。',
    date: '2026-08-12',
    category: '技術指南',
    readTime: '8 分鐘',
    content: `
## 什麼是 llms.txt？

llms.txt 是由 [llms.txt 提案](https://llmstxt.org/)提出的自願性純文字內容索引，通常放在網站根目錄。它可以用 Markdown 整理網站摘要與重要頁面，方便支援該格式的工具讀取。

它不是 robots.txt。robots.txt 是 crawler 存取政策；llms.txt 不負責允許或封鎖爬取，也不是通用排名訊號。Google 的官方 AI 搜尋指南明確說明不使用 llms.txt，因此網站不應把它放在可索引內容、robots.txt、sitemap、站內連結與內容品質之前。

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

1. 先確認主要內容以 HTML 呈現、能被索引，且 sitemap 與 canonical 正確
2. 只放可公開、可核對、與官網一致的品牌事實
3. 在 Geovault 產生草稿後人工檢查，不要把內部策略、個資或未公開價格放進去
4. 放到網站根目錄，或使用清楚標示來源網域的託管版本
5. 直接訪問 \`https://your-site.com/llms.txt\`，確認回傳 200 與 \`text/plain\`
6. 用實際 AI 問題集驗收提及與來源；不要把檔案存在本身當成成效

## 什麼時候不該先做 llms.txt？

如果網站仍被 robots.txt 封鎖、主要文字只能靠互動後載入、服務頁內容過薄，或品牌資料彼此矛盾，應先修正這些問題。llms.txt 是選用補充層，不是基本 SEO 的替代品。參考 [Google AI 搜尋內容指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)。
    `.trim(),
  },
  {
    slug: 'json-ld-for-ai',
    title: 'JSON-LD 結構化資料：AI 時代的必備 SEO 技術',
    description: 'JSON-LD 可協助搜尋系統理解頁面實體，但必須與可見內容一致，也不保證排名或 AI 引用。本文說明安全的實作與驗證方式。',
    date: '2026-08-12',
    category: '技術指南',
    readTime: '6 分鐘',
    content: `
## 為什麼 JSON-LD 對 AI SEO 很重要？

JSON-LD（JavaScript Object Notation for Linked Data）是一種結構化資料格式，可把頁面中的組織、地點、產品、文章或問答標示成機器可理解的實體。Google 支援並通常建議使用 JSON-LD，但 [結構化資料政策](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)也明確說明：正確標記不保證產生複合式搜尋結果，更不等於 AI 引用保證。

最重要的規則是「標記必須對應頁面上看得到的內容」。不能在 JSON-LD 宣稱未顯示的評價、價格、資格或服務，也不能用 FAQ Schema 填入頁面沒有呈現的問答。

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

Geovault 可以根據網站內容產生 JSON-LD 草稿，但發布前仍應人工核對品牌名稱、官方網址、地址、電話、服務類型與社群連結。完成後使用 [Google Rich Results Test](https://search.google.com/test/rich-results) 與 Schema.org Validator 驗證語法。

JSON-LD 的價值是降低實體理解歧義，不是把網站直接送進推薦清單。Google 對 AI 搜尋功能的官方建議仍以可索引性、內容品質與既有 SEO 基礎為主，可參考 [AI features and your website](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)。
    `.trim(),
  },
  {
    slug: 'ai-crawler-tracking',
    title: '如何追蹤 AI 爬蟲造訪你的網站',
    description: '了解 AI 與搜尋 crawler 的用途差異，以及 User-Agent、pixel、middleware 觀測能證明什麼、不能證明什麼。',
    date: '2026-08-12',
    category: 'AI 趨勢',
    readTime: '4 分鐘',
    content: `
## AI 爬蟲有哪些？

目前主要的 AI 爬蟲包括：

| 名稱 | 組織 | 官方定位或注意事項 |
|------|------|------------------|
| GPTBot | OpenAI | 訓練用途 |
| OAI-SearchBot | OpenAI | ChatGPT 搜尋結果的網站連結與摘要 |
| ChatGPT-User | OpenAI | 使用者操作所觸發的請求 |
| ClaudeBot / Claude-SearchBot | Anthropic | 不同產品用途應分開判讀 |
| PerplexityBot / Perplexity-User | Perplexity | 索引與使用者觸發請求應分開判讀 |
| Googlebot | Google | Google 搜尋 crawler |

Google-Extended 不應列在 HTTP User-Agent 造訪表中。它是 robots.txt 的控制 token，Google 官方說明它沒有獨立的 HTTP User-Agent 字串。

## 為什麼要追蹤？

- 觀察哪些請求使用已知 crawler User-Agent
- 找出 crawler 經常造訪的頁面與錯誤狀態碼
- 優化 robots.txt 設定
- 把 crawler 活動與實際 AI 引用驗收分開比較

## 如何追蹤

Geovault 追蹤碼使用 image beacon，讓執行 JavaScript 的客戶端帶回完整頁面 URL，無 JavaScript 的解析器則使用站點綁定 fallback。這避免為第三方網站放寬 credentialed CORS。

但 User-Agent 可以被偽造，pixel 也只會看到真的載入該資源的請求。因此介面把這些記錄標示為「UA 辨識」，不宣稱已經過供應商官方 IP 驗證，也不能把沒有記錄解讀成「從未被爬取」。真正的引用成效仍要看固定問題集的回答、來源連結與日期。

OpenAI 的 crawler 用途與 robots token 可查閱 [OpenAI crawler overview](https://developers.openai.com/api/docs/bots)；Google crawler 驗證方式可查閱 [Google crawler documentation](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)。
    `.trim(),
  },
  {
    slug: 'geo-vs-seo',
    title: 'GEO vs SEO：AI 時代的搜尋優化該怎麼做？',
    description: 'SEO 是 GEO 的可發現性基礎；GEO 再增加可核對、可摘要與引用驗收。本文提供可執行的雙軌方法與量測框架。',
    date: '2026-08-12',
    category: 'AI 趨勢',
    readTime: '7 分鐘',
    content: `
## SEO 與 GEO 的核心差異

| 層次 | SEO | GEO／AI 引用驗收 |
|------|-----|------------------|
| 可發現性 | 抓取、索引、canonical、內部連結 | 沿用同一套基礎，不能跳過 |
| 內容 | 滿足搜尋意圖、原創價值、可信來源 | 事實可核對、答案可摘要、實體一致 |
| 技術 | HTML、效能、結構化資料、sitemap | 結構化資料可共用；llms.txt 僅是選用提案 |
| 量測 | GSC 曝光、點擊、查詢、頁面、裝置 | 固定問題集的提及率、來源率、官網引用率 |
| 不能保證 | 排名、點擊或流量 | AI 提及、引用或推薦 |

## 兩者如何互補？

GEO 和 SEO 不是二選一。Google 的 [AI 搜尋內容指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)指出，既有 SEO 與內容品質原則同樣適用於 AI Overviews 與 AI Mode，沒有需要另外建立的特殊 AI 檔案或 schema。

1. 搜尋系統抓不到或不索引的頁面，也很難成為穩定引用來源
2. 結構化資料應描述可見內容；它協助理解，但不保證展示或引用
3. 高品質 FAQ 的價值來自回答真實問題，不是大量堆疊問答數量
4. 原創案例、方法、數據與清楚作者來源，比泛用改寫更有引用價值

## Geovault 如何分開量測？

Geovault 的「GEO 技術準備度分數」只檢查網站訊號完整度。新版權重總和為 100，其中 llms.txt 是 5 分的選用項目；分數不是 Google、ChatGPT 或其他平台公布的推薦機率。

真正的「AI 引用率」來自問題集執行結果：某品牌在多少次有效檢查中被提及。進一步還應分開看回答是否附來源、來源是否為官網、不同平台與問法是否一致。這兩套數據不能互相替代。

Search Console 則用來回答另一組問題：哪個查詢看得到頁面、哪個頁面有曝光卻沒有點擊、行動版與桌面版是否不同。應先從 Geovault 自有的指南、方法頁與產品說明建立查詢到頁面的對應，再決定要改標題、補內容或新增頁面；不能把第三方品牌的低曝光直接當成平台內容策略。

## 建議策略

1. **先修可抓取與索引**：檢查 HTTP 狀態、robots、canonical、sitemap、主要 HTML 與站內連結
2. **再修內容證據**：補齊品牌事實、服務邊界、作者／來源、第一手案例與實際問答
3. **加入機器可讀資料**：使用與可見內容一致的 JSON-LD；核心完成後再評估 llms.txt
4. **分開量測**：GSC 看搜尋曝光與點擊，問題集看 AI 提及與來源，不用技術分數代替成效
5. **保留時間序列**：每次修改都記錄日期、頁面與驗收結果，避免把自然波動誤判成因果

如果要從零開始，可搭配 [GEO 基礎說明](/blog/what-is-geo)、[JSON-LD 實作](/blog/json-ld-for-ai)與 [crawler 追蹤證據邊界](/blog/ai-crawler-tracking)一起使用。
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
