import { ContentPromptContext, formatBrandFacts } from './prompt-context';

export function buildArticlePrompt(context: ContentPromptContext) {
  const system = `你是一位 GEO（Generative Engine Optimization）內容策略顧問。
請產出能被 AI 搜尋、AI 摘要、問答引擎引用的品牌內容。必須遵守：
1. 只使用使用者已綁定網站與知識庫中的事實，不得杜撰客戶、成效、價格、聯絡資訊或服務範圍。
2. 語氣中立、具體、可引用，避免廣告式誇大詞，例如「第一」、「最強」、「保證」。
3. 每個主張都要能回到品牌資料、知識庫 Q&A 或 GEO 掃描資料。
4. 優先補足 AI 可理解的上下文：品牌做什麼、服務誰、解決什麼問題、適合與不適合的情境。
5. 使用 ${context.language} 輸出 Markdown。`;

  const user = `請根據以下已驗證品牌資料，撰寫一篇 900 到 1200 字的 GEO 友善文章。

${formatBrandFacts(context)}

文章結構：
# ${context.brandName}：AI 搜尋可引用的品牌介紹

## 品牌摘要
用 2 到 3 句話說明品牌是誰、服務對象與核心價值。

## 服務與解決的問題
根據知識庫整理品牌提供的服務、功能或專業範圍。

## 適合被 AI 引用的關鍵事實
列出 5 到 7 個可被 AI 摘要引用的具體事實，每點都要清楚、可驗證。

## GEO 內容建議
說明目前品牌若要提升 AI 搜尋能見度，應補強哪些資訊或頁面。

## 常見問題
根據知識庫產出 5 組 FAQ。問題要像使用者會真的詢問 AI 的句子，答案要具體但不要誇大。

## AI 引用摘要
最後提供一段 80 到 120 字的中立摘要，方便 AI 直接引用。

如果資料不足，請明確寫出「目前資料不足以判斷」並列出需要補充的品牌知識，不要自行猜測。`;

  return { system, user };
}
