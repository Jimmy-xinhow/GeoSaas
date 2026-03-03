# Sprint N（補債衝刺）— 基礎設施補齊 + Alpha 上線

> **Sprint Goal**：補齊所有 Alpha 上線的必要條件，讓產品可以交付給內測用戶。
>
> **時長**：2 週
>
> **預估總點數**：58 pts

---

## 一、目前缺口分析

以下是各 Sprint 遺留的技術債和缺失項目，依優先級排序：

| 缺口來源 | 缺失項目 | 優先級 | 影響 |
|---------|---------|--------|------|
| S1 | CI/CD Pipeline（GitHub Actions） | **P0** | 無法自動化測試和部署 |
| S1 | Google OAuth 登入 | P2 | 用戶體驗，非阻塞 |
| S3 | E2E 測試 — 核心掃描流程 | **P0** | 品質門檻要求 |
| S4 | 部署到生產環境（Vercel + Cloud Run） | **P0** | Alpha 上線硬需求 |
| S4 | 安全審計（OWASP 基礎） | **P1** | 上線前必要 |
| S4 | 效能優化（掃描速度、頁面載入） | P1 | 用戶體驗 |
| S7 | 監控排程系統（Cron 定時查詢） | **P1** | 監控功能不完整 |
| S7 | Email 通知（引用變動警報） | P2 | 可先用站內通知替代 |
| S5 | 內容排程發布 | P2 | 手動發布可替代 |
| S6 | 品牌知識庫（向量資料庫） | P3 | Phase 2 進階功能 |

---

## 二、Sprint 任務分配

### Week 1：基礎設施 + 測試

#### Day 1 (Monday) — Sprint Planning + CI/CD

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| Sprint Planning 會議 | 全員 | — | — |
| GitHub Actions CI Pipeline（lint + test + build） | Tech Lead | 5 | P0 |
| GitHub Actions CD Pipeline（Staging 自動部署） | Tech Lead | 5 | P0 |
| 整理 Git 分支策略（main / develop / staging） | Tech Lead | 2 | P0 |

#### Day 2-3 — E2E 測試

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| E2E 測試框架建置（Playwright/Cypress） | QA | 3 | P0 |
| E2E：註冊 → 登入 → Dashboard 流程 | QA | 5 | P0 |
| E2E：新增網站 → 觸發掃描 → 檢視結果 | QA | 5 | P0 |
| E2E：內容生成 → 發布流程 | QA | 3 | P1 |
| 補齊後端單元測試（Site / Content / Fix） | 後端 | 5 | P1 |

#### Day 4-5 — 安全審計 + 效能

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| OWASP 基礎安全掃描（dependency audit） | QA | 3 | P1 |
| API Rate Limiting / Throttling（@nestjs/throttler） | 後端 | 3 | P1 |
| 敏感資訊檢查（.env 洩漏防護、CORS 設定） | Tech Lead | 2 | P0 |
| 前端效能基線測量（Lighthouse） | 前端 | 2 | P1 |

---

### Week 2：部署 + 監控排程 + 收尾

#### Day 6-7 — 生產環境部署

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| 前端部署至 Vercel（Production） | 前端 | 3 | P0 |
| 後端部署至 Cloud Run / Railway | 後端 | 5 | P0 |
| 環境變數管理（Production secrets） | Tech Lead | 2 | P0 |
| 健康檢查端點 + 基礎監控（uptime） | 後端 | 2 | P1 |

#### Day 8 — 監控排程

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| Monitor 定時排程（@nestjs/schedule Cron Job） | 後端 | 3 | P1 |
| 排程頻率設定（Free: 週一次 / Pro: 日一次） | 後端 | 2 | P1 |

#### Day 9-10 — 整合測試 + Sprint Review

| 任務 | 負責人 | Story Points | 優先級 |
|------|--------|-------------|--------|
| 生產環境 Smoke Test | QA | 2 | P0 |
| Bug 修復 + 最終調整 | 全員 | — | — |
| Sprint Review（Demo） | 全員 | — | — |
| Sprint Retrospective | 全員 | — | — |

---

## 三、驗收標準 (Definition of Done)

### 必須達成（Alpha 上線門檻）
- [ ] CI Pipeline 正常運行（push → lint → test → build → 綠燈）
- [ ] CD Pipeline 可自動部署至 Staging
- [ ] 生產環境可正常訪問（前端 + 後端 + 資料庫）
- [ ] E2E 測試覆蓋 3 條核心路徑（Auth / Scan / Content）
- [ ] 無 P0 級 Bug
- [ ] CORS / Rate Limiting / 環境變數已正確設定
- [ ] `.env` 絕無洩漏至 Git

### 盡量達成
- [ ] 單元測試覆蓋率 > 60%
- [ ] Lighthouse Performance Score > 80
- [ ] Monitor Cron Job 正常運行
- [ ] dependency audit 無 critical vulnerability

---

## 四、風險與緩解

| 風險 | 影響 | 機率 | 緩解措施 |
|------|------|------|---------|
| API Keys 未取得（OpenAI/Perplexity/Gemini） | 監控功能無法 Demo | 中 | 先用 Claude detector demo，其他 graceful fallback |
| Stripe Price ID 未設定 | 付費流程不通 | 中 | Stripe Test Mode + 測試用 Price ID |
| 部署平台選擇延遲 | 影響上線時間 | 低 | 預設 Vercel + Railway，不做比較 |
| E2E 測試因環境差異失敗 | 品質門檻不達標 | 中 | 先以 headless 本地跑，再上 CI |

---

## 五、Sprint 後下一步

完成本 Sprint 後，建議按以下順序推進：

| 接續 Sprint | 重點 | 預計時長 |
|------------|------|---------|
| Sprint A | 競品分析系統（S8 核心）+ 月度報告 | 2 週 |
| Sprint B | 品牌知識庫（向量 DB）+ 內容排程 + Email 通知 | 2 週 |
| Sprint C | 規模化功能（團隊協作、API 開放、i18n） | 2 週 |
| Sprint D | 全面效能優化 + 安全滲透測試 + v1.0 正式上線 | 2 週 |

---

## 六、Story Points 彙總

| 類別 | 點數 |
|------|------|
| CI/CD + Git | 12 |
| E2E + 單元測試 | 21 |
| 安全 + 效能 | 10 |
| 部署 | 12 |
| 監控排程 | 5 |
| **總計** | **58 pts** |

> **備註**：以目前團隊過往 Sprint 平均 55-60 pts 的 velocity 來看，此 Sprint 在合理負荷內。
