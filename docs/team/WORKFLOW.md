# GEO SaaS - 敏捷開發工作流程

## Sprint 週期：2 週

---

## 一、Sprint 節奏（雙週循環）

```
Week 1                              Week 2
┌──────────────────────────┐  ┌──────────────────────────┐
│ Mon: Sprint Planning     │  │ Mon: Daily Standup       │
│ Tue-Fri: 開發執行         │  │ Tue-Thu: 開發/測試/修復   │
│ Daily Standup (15min)    │  │ Fri AM: Sprint Review    │
│                          │  │ Fri PM: Retrospective    │
└──────────────────────────┘  └──────────────────────────┘
```

---

## 二、會議制度

### 1. 每日站會 (Daily Standup) — 15 分鐘
- **時間**：每天 10:00 AM
- **參與**：全開發組 + PM
- **格式**：每人回答三個問題
  - 昨天完成了什麼？
  - 今天計劃做什麼？
  - 有什麼阻礙？
- **原則**：不討論解決方案，阻礙事項會後處理

### 2. Sprint Planning — 2 小時
- **時間**：Sprint 第 1 天（週一）
- **參與**：全員
- **流程**：
  1. PO 介紹 Sprint 目標與優先級 User Stories（30 min）
  2. 團隊估點（Story Points）與任務拆解（60 min）
  3. 確認 Sprint Backlog 與承諾（30 min）
- **產出**：Sprint Backlog、Sprint Goal

### 3. Sprint Review — 1 小時
- **時間**：Sprint 最後一天上午
- **參與**：全員 + 利害關係人
- **流程**：
  1. Demo 完成的功能（40 min）
  2. 收集回饋（20 min）
- **產出**：Demo 紀錄、回饋清單

### 4. Sprint Retrospective — 1 小時
- **時間**：Sprint 最後一天下午
- **參與**：開發組 + PM
- **格式**：Start / Stop / Continue
  - 應該開始做什麼？
  - 應該停止做什麼？
  - 應該繼續做什麼？
- **產出**：改善行動項目

### 5. Backlog Grooming — 1 小時
- **時間**：Sprint 第 2 週的週三
- **參與**：PO + Tech Lead + PM
- **流程**：梳理下個 Sprint 的候選 Stories

---

## 三、任務狀態流

```
┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐
│ Backlog  │───▶│ Sprint Todo  │───▶│ In Progress│──▶│ Review  │───▶│  Done  │
│ (待排期) │    │ (本期待辦)    │    │  (進行中)  │   │(審查中) │    │(已完成) │
└──────────┘    └──────────────┘    └──────────┘    └─────────┘    └────────┘
                                         │                │
                                         │                │ (打回)
                                         ◀────────────────┘
```

### 任務標籤
- `P0-Critical`：阻塞性問題，需立即處理
- `P1-High`：當前 Sprint 必須完成
- `P2-Medium`：當前 Sprint 盡量完成
- `P3-Low`：可延後至下個 Sprint
- `bug`：缺陷修復
- `feature`：新功能
- `tech-debt`：技術債償還
- `spike`：技術調研

---

## 四、Git 工作流

```
main (production)
 │
 ├── develop (開發主幹)
 │    │
 │    ├── feature/GEO-101-scan-engine
 │    ├── feature/GEO-102-dashboard
 │    ├── feature/GEO-103-content-editor
 │    │
 │    ├── bugfix/GEO-201-scan-timeout
 │    │
 │    └── hotfix/GEO-301-auth-crash
 │
 └── staging (預發布環境)
```

### 分支命名規則
- 功能分支：`feature/GEO-{ticket}-{簡述}`
- 修復分支：`bugfix/GEO-{ticket}-{簡述}`
- 緊急修復：`hotfix/GEO-{ticket}-{簡述}`

### PR 流程
1. 開發者建立 PR → develop
2. 至少 1 位 Reviewer 審查（Tech Lead 或同組成員）
3. CI 通過（Lint + 測試 + Build）
4. Squash Merge 合併
5. 刪除已合併分支

### Commit 格式
```
<type>(<scope>): <subject>

feat(scan): add JSON-LD validation check
fix(auth): resolve token refresh race condition
docs(api): update scan endpoint documentation
refactor(dashboard): extract chart components
test(scan): add unit tests for schema validator
```

---

## 五、發版流程

### 定期發版：每 Sprint 結束
```
develop ──(merge)──▶ staging ──(驗證)──▶ main ──(tag)──▶ v1.x.0
```

### 緊急發版
```
main ──(hotfix branch)──▶ fix ──(merge)──▶ main ──(tag)──▶ v1.x.1
                                    └──(merge)──▶ develop
```

---

## 六、品質門檻

| 項目 | 標準 |
|------|------|
| 單元測試覆蓋率 | ≥ 80% |
| E2E 測試 | 關鍵路徑 100% 覆蓋 |
| Code Review | 所有 PR 必須至少 1 人審查 |
| CI 通過 | PR 合併前 CI 必須全綠 |
| 效能指標 | API P95 < 500ms, 頁面 LCP < 2.5s |
| 安全掃描 | 每 Sprint 執行一次 dependency audit |

---

## 七、風險管理機制

| 風險等級 | 定義 | 處理方式 |
|---------|------|---------|
| 🔴 Red | Sprint 目標可能無法達成 | 立即通知 PO，調整範圍 |
| 🟡 Yellow | 部分任務有延遲風險 | 站會中提出，PM 協調資源 |
| 🟢 Green | 進度正常 | 繼續執行 |

### 每日風險檢視（PM 職責）
- 檢查 Burndown Chart 是否偏離
- 確認無阻塞性依賴
- 追蹤技術風險與外部依賴
