# Citation-Readiness Gate (CRG) — Spec

> 發佈前的「會不會被引用」閘門。取代純啟發式品質檢查，改以「AI 引擎實際引用/推薦的條件」評分。
> 一致性 + 去重 + 自我審查三合一，這是其他 GEO 優化的地基。

## 目標

每篇內容發佈前，預測它能不能被 AI 引擎 **檢索 → 引用 → （貢獻於）推薦**，並在不過關時給出可執行的修法。三個獨立訊號合成：

1. **去重（deterministic）** — trigram Jaccard 比對同站已發佈語料，擋近重複（稀釋網站足跡）。複用 `content-quality/text-similarity.util`。
2. **實體一致性 lint（deterministic）** — 文章不得偏離品牌標準事實（BrandFactGraph）：品牌名出現且一致、無編造聯絡資訊、不與已驗證事實矛盾、含官網。**實體一致性是 AI 能把多處提及合併成同一實體的前提 → 被推薦的必要條件。**
3. **Claude 引用就緒度評審（LLM）** — 用 Claude 對「真正驅動引用」的維度評分。

## 三號訊號：Claude 評審維度（0–100 每項）

| 維度 | 問什麼 |
|------|--------|
| `answerFirst` | 開頭是否直接回答一個真實查詢（先講結論）？ |
| `extractable` | 是否有「離開上下文也成立、可被直接引用、含品牌名+具體事實」的句子？ |
| `queryMatch` | 真實 AI 使用者的提問會不會檢索到這篇？（評審先生成 3 個最可能的查詢，再檢查覆蓋）|
| `specificity` | 具體事實（數字/條件/時間）vs 空泛宣稱 |
| `citationSafety` | 無未經驗證的宣稱/誇飾（AI 會降權的廣告腔）|

**評審額外輸出**：`overall`(0–100)、`targetQueries[]`（生成的 3 個查詢）、`weakestPassage`（最弱的一段原文）、`suggestedRewrite`（該段的具體改寫）。

## 合成 → 判定

```
verdict =
  dedup.isDuplicate                       → 'reject'   (near_duplicate)
  entity.hardFail                         → 'reject'   (fabricated_contact / brand_absent / fact_contradiction)
  judge.overall >= THRESHOLD && !above    → 'ready'
  否則                                     → 'repair'   (附 weakestPassage 改寫，可走一次重寫再評)

score (0–100 複合) = round(0.55*judge.overall + 0.30*entity.score + 0.15*dedupHeadroom)
  dedupHeadroom = clamp(100 - similarity*200, 0, 100)   // 相似度 0→100, 0.5→0
THRESHOLD = 78（可調）
```

## 輸出（驅動 repair 迴路）

```ts
interface CitationReadinessResult {
  verdict: 'ready' | 'repair' | 'reject';
  score: number;
  dedup:  { score: number; against: 'existing'|'none'; isDuplicate: boolean };
  entity: { score: number; brandPresent: boolean; officialUrlPresent: boolean;
            fabricatedContact: string[]; contradictions: string[]; hardFail: boolean };
  judge:  { overall: number; answerFirst: number; extractable: number;
            queryMatch: number; specificity: number; citationSafety: number;
            targetQueries: string[]; weakestPassage: string; suggestedRewrite: string };
  reasons: string[];   // 可執行原因碼
}
```

## 落地階段

- **Phase 1（先做）**：dry-run 預覽 — `assess()` 方法 + Admin 端點 + 腳本，沿用 FAQ 預覽的「先驗證再接線」模式。不改任何發佈路徑。
- **Phase 2（驗證後）**：接進 client_daily / FAQ / brand_showcase 發佈路徑——只有 `ready` 上線；`repair` 觸發一次「只重寫 weakestPassage」再評；`reject` 不發。
- **Phase 3**：把 `targetQueries` 餵回 AI 監控，量測被引率，閉環。

## 模型與成本

- 評審模型預設 `claude-opus-4-8`（Anthropic 建議的最強預設）。可用 `CRG_JUDGE_MODEL` 覆寫。
- **成本槓桿**：每篇 1 次 Claude 呼叫。大量時可改 `claude-haiku-4-5`（便宜、速度快）——這是你的決定，預設不自動降級。
- 結構化輸出用 forced tool-use（SDK 0.30 穩定）。輸入截斷文章 ~6k 字 + 品牌事實；max_tokens ~1500。

## 不做什麼（避免 scope 蔓延）

- 不在 Phase 1 改發佈路徑（先驗證閘門判斷準不準）。
- 不重寫整篇——repair 只動 weakestPassage（最小、可逆）。
- 去重沿用既有 trigram 工具，不引入 embedding（離線、零 API）。
