# GEO SaaS - RACI 責任分配矩陣

## RACI 定義
- **R** (Responsible) — 負責執行
- **A** (Accountable) — 最終負責/決策
- **C** (Consulted) — 諮詢對象
- **I** (Informed) — 需被通知

---

## 一、產品決策

| 活動 | PO | Tech Lead | PM | 前端 | 後端 | AI | QA | 增長 |
|------|:--:|:---------:|:--:|:----:|:----:|:--:|:--:|:----:|
| 產品路線圖 | A/R | C | C | I | I | I | I | C |
| 功能優先級 | A/R | C | C | I | I | I | I | C |
| 用戶故事撰寫 | A/R | C | C | I | I | I | I | I |
| 定價策略 | A/R | I | C | I | I | I | I | C |
| 競品分析 | R | I | I | I | I | I | I | A/R |

---

## 二、專案管理

| 活動 | PO | Tech Lead | PM | 前端 | 後端 | AI | QA | 增長 |
|------|:--:|:---------:|:--:|:----:|:----:|:--:|:--:|:----:|
| Sprint 計劃 | C | C | A/R | R | R | R | R | I |
| 每日站會 | I | R | A/R | R | R | R | R | I |
| Sprint Review | A | R | R | R | R | R | R | I |
| Retrospective | I | R | A/R | R | R | R | R | I |
| 進度追蹤 | I | C | A/R | I | I | I | I | I |
| 風險管理 | C | C | A/R | I | I | I | I | I |
| 資源分配 | A | C | R | I | I | I | I | I |

---

## 三、技術決策

| 活動 | PO | Tech Lead | PM | 前端 | 後端 | AI | QA | 增長 |
|------|:--:|:---------:|:--:|:----:|:----:|:--:|:--:|:----:|
| 技術架構設計 | I | A/R | I | C | C | C | I | I |
| 技術選型 | I | A/R | I | C | C | C | I | I |
| Code Review | I | A/R | I | R | R | R | I | I |
| 資料庫設計 | I | A/R | I | I | R | C | I | I |
| API 設計 | I | A/R | I | C | R | C | I | I |
| 安全架構 | I | A/R | I | R | R | I | C | I |

---

## 四、開發執行

| 活動 | PO | Tech Lead | PM | 前端 A | 前端 B | 後端 A | 後端 B | AI | QA |
|------|:--:|:---------:|:--:|:------:|:------:|:------:|:------:|:--:|:--:|
| Dashboard UI | I | C | I | A/R | C | I | I | I | I |
| Landing Page | C | I | I | I | A/R | I | I | I | I |
| 內容編輯器 | I | C | I | C | A/R | I | I | C | I |
| 認證系統 | I | C | I | R | I | A/R | I | I | I |
| 掃描引擎 | I | C | I | I | I | I | A/R | I | I |
| 計費系統 | C | C | I | R | I | A/R | I | I | I |
| AI 內容引擎 | I | C | I | I | I | C | I | A/R | I |
| 爬蟲系統 | I | C | I | I | I | I | A/R | I | I |
| 監控系統 | I | C | I | R | I | R | A/R | I | I |
| 多平台佈局 | I | C | I | I | A/R | I | R | C | I |

---

## 五、品質保證

| 活動 | PO | Tech Lead | PM | 前端 | 後端 | AI | QA |
|------|:--:|:---------:|:--:|:----:|:----:|:--:|:--:|
| 測試策略制定 | I | C | I | I | I | I | A/R |
| 單元測試 | I | C | I | R | R | R | C |
| E2E 測試 | I | I | I | C | C | I | A/R |
| 效能測試 | I | C | I | I | I | I | A/R |
| 安全測試 | I | A | I | I | I | I | R |
| Bug 分類與追蹤 | I | C | C | I | I | I | A/R |
| 發版驗證 | I | A | I | I | I | I | R |

---

## 六、發版與維運

| 活動 | PO | Tech Lead | PM | 前端 | 後端 | AI | QA |
|------|:--:|:---------:|:--:|:----:|:----:|:--:|:--:|
| 發版決定 | A | R | C | I | I | I | C |
| 部署執行 | I | A/R | I | I | C | I | I |
| 線上監控 | I | A | I | I | R | I | I |
| 事件回應 | I | A/R | C | R | R | I | I |
| 回滾決定 | C | A/R | I | I | I | I | I |

---

## 七、增長與營運

| 活動 | PO | Tech Lead | PM | 增長主管 | 內容 | 行銷 | 客戶成功 |
|------|:--:|:---------:|:--:|:-------:|:----:|:----:|:-------:|
| 增長策略 | A | I | I | R | C | C | C |
| 內容營運 | C | I | I | A | R | C | I |
| 付費投放 | A | I | I | A | I | R | I |
| 客戶 Onboarding | C | I | I | C | I | I | A/R |
| 客戶回饋收集 | A | I | C | I | I | I | R |
| 合作夥伴 | A | I | I | R | I | C | I |
