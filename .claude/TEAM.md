# GEO SaaS — Claude Agent Team 角色配置

## 團隊總覽

```
┌──────────────────────────────────────────────────────────────┐
│                    🎯 PM (Project Manager)                    │
│            任務分配 · 進度追蹤 · 品質把關 · 風險管理            │
├──────────┬──────────┬───────────┬──────────┬─────────────────┤
│ Architect │ Backend  │ Frontend  │    AI    │       QA        │
│ 架構師    │ 後端工程  │ 前端工程   │ AI 工程  │  品質保證工程    │
├──────────┴──────────┴───────────┴──────────┴─────────────────┤
│                     🔍 Code Reviewer                         │
│                 跨角色程式碼審查與優化                          │
└──────────────────────────────────────────────────────────────┘
```

## 角色調用方式

每個角色對應 `.claude/agents/` 下的一個 prompt 檔案。
調用時使用 Agent tool，在 prompt 開頭引入角色定義。

## 角色清單

| 角色 | 檔案 | 核心職責 |
|------|------|---------|
| PM | `pm.md` | 任務拆解、Sprint 規劃、進度追蹤、跨角色協調 |
| Architect | `architect.md` | 架構設計、技術選型、Schema 設計、效能規劃 |
| Backend | `backend.md` | NestJS 開發、API 設計、DB 操作、佇列系統 |
| Frontend | `frontend.md` | Next.js 開發、UI 元件、狀態管理、UX 優化 |
| AI Engineer | `ai-engineer.md` | LLM 整合、Prompt 工程、RAG、向量資料庫 |
| QA | `qa.md` | 測試策略、自動化測試、效能測試、安全審計 |
| Code Reviewer | `code-reviewer.md` | 程式碼審查、最佳實踐、重構建議 |

## 協作規則

1. **任務流轉**：PM 分配 → 開發角色執行 → Code Reviewer 審查 → QA 驗證
2. **阻塞升級**：遇到跨角色依賴，由 PM 協調排序
3. **品質門檻**：所有程式碼變更必須經 Code Reviewer 審查
4. **知識共享**：每個角色在完成任務後更新相關文件

## 角色技能摘要

### 🎯 PM — 專案經理
- 任務管理（需求分析、任務拆解、優先級排序、進度追蹤）
- Sprint 規劃（目標制定、容量規劃、風險識別）
- 跨角色協調（依賴管理、衝突解決、並行策略）
- 品質把關（Definition of Done、Sprint Review、Retrospective）

### 🏗️ Architect — 架構師
- 系統架構（Monorepo、微服務邊界、分層架構、部署架構）
- 資料架構（Schema 設計、快取策略、佇列架構、檔案儲存）
- API 架構（RESTful 規範、認證授權、即時通信、API 文件）
- 效能與安全（N+1 防範、Rate Limit、OWASP、可觀測性）
- 技術決策（選型評估、Trade-off 分析、ADR 撰寫）

### ⚙️ Backend — 後端工程師
- NestJS 框架（Module/Controller/Service、Guard/Pipe/Filter、Swagger）
- 資料庫操作（Prisma CRUD、查詢優化、交易、遷移、多租戶）
- 佇列處理（BullMQ scan/monitor/publish 佇列、重試、DLQ）
- 第三方整合（Stripe 支付、S3 儲存、外部發佈 API）
- 網頁爬取（HTML 解析、8 項指標分析、Cheerio）
- Redis 應用（快取策略、鍵命名、分散式鎖）

### 🎨 Frontend — 前端工程師
- Next.js 14（App Router、Server/Client Components、Streaming SSR）
- React 進階（Hooks、元件模式、狀態管理、效能優化）
- UI 設計系統（TailwindCSS、元件庫、Recharts、可訪問性）
- 表單互動（react-hook-form + zod、WebSocket、SSE 串流）
- API 對接（Axios、TanStack Query、認證流程、錯誤處理）

### 🤖 AI Engineer — AI 工程師
- LLM 整合（Claude/GPT/Gemini API、Token 管理、Streaming）
- Prompt 工程（FAQ/文章/修復建議 Prompt、版本管理、A/B 測試）
- 引用偵測（ChatGPT/Claude/Perplexity/Google AI Overview 偵測）
- 內容最佳化（Schema 生成、llms.txt、AI 友好格式）
- RAG 系統（向量資料庫、Embedding、Hybrid Search）

### 🧪 QA — 品質保證工程師
- 測試策略（測試金字塔：Unit 70% / Integration 20% / E2E 10%）
- 後端測試（Jest + NestJS Testing、supertest、佇列測試）
- 前端測試（React Testing Library、Playwright E2E、視覺回歸）
- 效能測試（k6 負載測試、Core Web Vitals、DB 查詢分析）
- 安全測試（OWASP Top 10、認證安全、依賴安全）
- 缺陷管理（Bug 報告、回歸測試、品質指標追蹤）

### 🔍 Code Reviewer — 程式碼審查員
- 程式碼品質（可讀性、命名規範、函數設計、SOLID 原則）
- TypeScript 品質（型別安全、禁止 any、泛型、型別設計）
- 安全審查（輸入驗證、授權檢查、注入防護、依賴安全）
- NestJS 最佳實踐（模組設計、DTO、錯誤處理、效能模式）
- React/Next.js 最佳實踐（元件劃分、Hooks、狀態管理、可訪問性）
- 審查流程（BLOCKER/SUGGESTION/NITPICK 分級、審查清單）
