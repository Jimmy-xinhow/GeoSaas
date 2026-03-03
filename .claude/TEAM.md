# GEO SaaS — Claude Agent Team

## 自動化團隊架構

```
                    ┌─────────────────────────┐
                    │   User（你）              │
                    │   觸發：/agent pm         │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   🎯 PM Agent            │
                    │   讀取 Sprint Plan       │
                    │   建立 Tasks             │
                    │   產出調度計劃            │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼──────┐ ┌────────▼────────┐ ┌───────▼────────┐
    │ ⚙️ Backend     │ │ 🎨 Frontend     │ │ 🧪 QA          │
    │ API / DB /     │ │ Pages / Hooks / │ │ Tests / Audit / │
    │ Queue / Auth   │ │ UI Components  │ │ Performance    │
    └─────────┬──────┘ └────────┬────────┘ └───────┬────────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ 🔍 Code Reviewer         │
                    │ 審查所有變更              │
                    │ 自動修復 BLOCKER          │
                    └─────────────────────────┘
```

## 使用方式

### 方法 1：PM 全自動調度
```bash
# PM 讀取 Sprint 計劃，建立所有任務，產出調度計劃
/agent pm
```

### 方法 2：指定角色執行
```bash
# 讓特定角色自動認領並執行任務
/agent backend
/agent frontend
/agent qa
/agent ai-engineer
/agent architect
/agent code-reviewer
```

### 方法 3：並行執行（最高效）
在主對話中用 Agent tool 同時派出多個 agent：
```
同時執行：
- Agent(backend): 建立 CI/CD Pipeline
- Agent(qa): 撰寫 E2E 測試
- Agent(frontend): 部署至 Vercel
```

## Agent 清單

| Agent | 檔案 | 自動化行為 |
|-------|------|-----------|
| **PM** | `agents/pm.md` | 讀 Sprint Plan → 建立 Tasks → 產出調度計劃 |
| **Backend** | `agents/backend.md` | 認領任務 → 寫 API/Service/DTO → 跑 tsc + jest → 回報 |
| **Frontend** | `agents/frontend.md` | 認領任務 → 寫 Page/Hook/Component → 跑 tsc → 回報 |
| **QA** | `agents/qa.md` | 認領任務 → 寫測試/安全審計/效能測量 → 跑 jest → 回報 |
| **AI Engineer** | `agents/ai-engineer.md` | 認領任務 → Prompt/Detector/RAG → 跑 tsc → 回報 |
| **Architect** | `agents/architect.md` | 認領任務 → Schema/API 設計/部署配置 → 回報 |
| **Code Reviewer** | `agents/code-reviewer.md` | git diff → 逐檔審查 → 產出報告 → 自動修復 BLOCKER |

## 協作規則

### 執行順序
1. **PM** 先跑 — 建立任務和依賴
2. **Backend + Frontend + QA** 並行 — 各自認領任務
3. **Code Reviewer** 最後跑 — 審查所有變更
4. **Architect** 按需調用 — Schema 設計、部署架構

### 任務狀態流
```
pending → in_progress → completed
  ↑                        │
  └── (發現問題) ───────────┘
```

### 品質門檻
- 所有程式碼 `tsc --noEmit` 必須通過
- 核心模組 `jest` 測試必須通過
- Code Reviewer 無 BLOCKER 才可合併
- 前端 UI 文字必須繁體中文

## 專案快速參考

```
apps/api/src/modules/    — NestJS 後端模組
apps/web/src/app/        — Next.js 頁面路由
apps/web/src/hooks/      — API Hooks (React Query)
apps/web/src/stores/     — Zustand 狀態
packages/database/prisma/ — Schema
packages/shared/src/      — 共用型別
docs/sprints/            — Sprint 規劃
```
