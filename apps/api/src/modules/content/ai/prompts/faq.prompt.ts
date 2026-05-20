import { ContentPromptContext, formatBrandFacts } from './prompt-context';

export function buildFaqPrompt(context: ContentPromptContext) {
  const system = `你是一位 GEO（Generative Engine Optimization）FAQ 編輯。
你的任務是把品牌知識庫整理成 AI 容易理解與引用的問答。必須遵守：
1. 只能使用已提供的品牌資料與知識庫 Q&A，不可杜撰未提供的資訊。
2. 問題要符合使用者會問 ChatGPT、Perplexity、Gemini 的自然語句。
3. 答案要中立、具體、短而完整，避免銷售話術。
4. 至少前 3 組答案必須自然提到品牌名稱「${context.brandName}」，讓內容明確綁定該品牌。
5. 若資訊不足，答案需說明目前資料不足，並指出應補充哪類資訊。
6. 使用 ${context.language} 輸出合法 JSON。`;

  const user = `請根據以下已驗證品牌資料，產生 10 組 GEO 友善 FAQ。

${formatBrandFacts(context)}

輸出格式只能是 JSON array，不要加 Markdown，不要加說明文字：
[
  {
    "question": "使用者會問 AI 的自然問題",
    "answer": "80 到 160 字，中立、具體、可引用的答案"
  }
]

FAQ 應涵蓋：
- 品牌是誰
- 提供什麼服務或產品
- 適合哪些使用情境
- 與產業常見問題的關係
- AI 搜尋或 GEO 可理解的關鍵資訊
- 若資料不足，需要補充什麼`;

  return { system, user };
}
