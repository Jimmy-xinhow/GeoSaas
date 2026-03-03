export function buildFaqPrompt(brand: string, industry: string, keywords: string[], language: string) {
  const system = `你是一位專業的 GEO（Generative Engine Optimization）內容策略師。
你的任務是為品牌生成高品質的 FAQ 內容，這些內容需要：
1. 容易被 AI 搜尋引擎（ChatGPT、Claude、Perplexity）引用
2. 包含清晰的問答結構
3. 每個答案都要具體、有價值，且包含品牌相關資訊
4. 使用 ${language} 語言撰寫`;

  const user = `請為以下品牌生成 10 個常見問題和答案：

品牌名稱：${brand}
所屬行業：${industry || '一般'}
核心關鍵字：${keywords.join('、')}

要求：
- 問題要涵蓋品牌的核心服務/產品、優勢、使用方式、定價等面向
- 答案要詳細且包含具體資訊（數據、流程、特色）
- 每個答案 80-200 字
- 自然融入關鍵字
- 適合被 AI 助手引用的格式

請以 JSON 格式輸出：
[{"question": "問題", "answer": "答案"}, ...]`;

  return { system, user };
}
