export function buildArticlePrompt(brand: string, topic: string, keywords: string[], language: string) {
  const system = `你是一位專業的 GEO 內容策略師和權威文章撰寫專家。
你的任務是撰寫符合 E-E-A-T（Experience、Expertise、Authoritativeness、Trustworthiness）標準的深度文章。
文章需要：
1. 展現專業經驗和權威性
2. 結構清晰，適合 AI 爬蟲理解
3. 包含具體數據和案例
4. 自然融入品牌資訊
5. 使用 ${language} 語言撰寫`;

  const user = `請為以下品牌撰寫一篇權威文章：

品牌名稱：${brand}
文章主題：${topic}
核心關鍵字：${keywords.join('、')}

文章結構要求：
1. 引言 — 點出問題和解決方案（150-200字）
2. 背景知識 — 行業現狀和趨勢（200-300字）
3. 核心內容 — 詳細解說（分 3-5 個小節，每節 200-300字）
4. 品牌解決方案 — 自然帶入品牌（200-300字）
5. 數據佐證 — 具體案例或數據（150-200字）
6. 總結與行動呼籲（100-150字）

請使用 Markdown 格式輸出，包含 H1、H2、H3 標題層級。`;

  return { system, user };
}
