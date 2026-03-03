# GEO SaaS - 技術架構設計

## 一、系統架構總覽

```
                            ┌─────────────────┐
                            │   CDN (Vercel)   │
                            │  Static Assets   │
                            └────────┬────────┘
                                     │
                            ┌────────▼────────┐
                            │   Next.js App    │
                            │   (Frontend)     │
                            │   Port: 3000     │
                            └────────┬────────┘
                                     │ HTTPS
                            ┌────────▼────────┐
                            │   API Gateway    │
                            │   (NestJS)       │
                            │   Port: 4000     │
                            └────────┬────────┘
                                     │
        ┌────────────┬───────────────┼───────────────┬────────────┐
        │            │               │               │            │
┌───────▼──────┐ ┌───▼────────┐ ┌───▼────────┐ ┌───▼──────┐ ┌──▼──────────┐
│  Auth        │ │  Scan      │ │  Content   │ │  Monitor │ │  Publish    │
│  Service     │ │  Service   │ │  Service   │ │  Service │ │  Service    │
│              │ │            │ │            │ │          │ │             │
│ - Register   │ │ - Crawl    │ │ - Generate │ │ - Track  │ │ - Medium    │
│ - Login      │ │ - Analyze  │ │ - Edit     │ │ - Alert  │ │ - LinkedIn  │
│ - OAuth      │ │ - Score    │ │ - Template │ │ - Report │ │ - WordPress │
│ - RBAC       │ │ - Fix      │ │ - Translate│ │ - Compare│ │ - Directory │
└───────┬──────┘ └───┬────────┘ └───┬────────┘ └───┬──────┘ └──┬──────────┘
        │            │               │               │           │
        └────────────┴───────┬───────┴───────────────┴───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
      │ PostgreSQL   │ │  Redis   │ │  S3/MinIO   │
      │              │ │          │ │             │
      │ - Users      │ │ - Cache  │ │ - Reports   │
      │ - Sites      │ │ - Queue  │ │ - llms.txt  │
      │ - Scans      │ │ - Session│ │ - Exports   │
      │ - Content    │ │ - Rate   │ │ - Images    │
      │ - Reports    │ │   Limit  │ │             │
      └──────────────┘ └──────────┘ └─────────────┘
              │
      ┌───────▼──────┐
      │  Pinecone /  │
      │  Weaviate    │
      │              │
      │ - Brand      │
      │   Knowledge  │
      │ - Embeddings │
      └──────────────┘
```

---

## 二、技術選型

### Frontend
| 技術 | 用途 | 選擇理由 |
|------|------|---------|
| Next.js 14+ | 前端框架 | SSR/SSG、App Router、效能優異 |
| TypeScript | 型別安全 | 降低 Bug、提升 DX |
| TailwindCSS | 樣式系統 | 快速開發、一致性 |
| shadcn/ui | UI 元件庫 | 可客製化、設計美觀 |
| TipTap | 富文本編輯器 | 可擴展、支援協作 |
| Recharts | 圖表視覺化 | React 友善、效能好 |
| Zustand | 狀態管理 | 輕量、簡單 |
| React Query | 伺服器狀態 | 緩存、重試、樂觀更新 |

### Backend
| 技術 | 用途 | 選擇理由 |
|------|------|---------|
| NestJS | API 框架 | 模組化、TypeScript 原生、企業級 |
| Prisma | ORM | 型別安全、遷移管理 |
| PostgreSQL | 主資料庫 | 可靠、功能豐富 |
| Redis | 緩存/佇列 | 高效能、多用途 |
| BullMQ | 任務佇列 | 排程、重試、優先級 |
| Passport.js | 認證 | OAuth 整合豐富 |
| Stripe | 支付 | SaaS 訂閱標準 |

### AI / ML
| 技術 | 用途 | 選擇理由 |
|------|------|---------|
| Claude API | 主要 LLM | 品質高、支援長文本 |
| OpenAI API | 備用 LLM | 多模型選擇 |
| LangChain | AI 工作流 | 鏈式呼叫、模板管理 |
| Pinecone | 向量資料庫 | 品牌知識庫、語義搜索 |

### 爬蟲 / 分析
| 技術 | 用途 | 選擇理由 |
|------|------|---------|
| Playwright | 網頁爬蟲 | 支援 SPA、穩定 |
| Cheerio | HTML 解析 | 輕量、快速 |
| Lighthouse SDK | 效能分析 | Google 標準 |

### 基礎設施
| 技術 | 用途 | 選擇理由 |
|------|------|---------|
| Vercel | 前端部署 | Next.js 最佳支援 |
| Railway / Render | 後端部署 | 簡單、自動擴展 |
| AWS S3 | 檔案儲存 | 可靠、便宜 |
| GitHub Actions | CI/CD | 與 GitHub 深度整合 |
| Sentry | 錯誤追蹤 | 即時告警 |
| Grafana | 監控 | 可視化儀表板 |

---

## 三、資料庫 Schema 核心設計

```prisma
// ===== 使用者系統 =====
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  avatarUrl     String?
  role          UserRole  @default(USER)
  plan          Plan      @default(FREE)
  stripeId      String?   @unique
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sites         Site[]
  contents      Content[]
  team          TeamMember[]
}

enum UserRole { USER ADMIN }
enum Plan { FREE STARTER PRO ENTERPRISE }

// ===== 網站管理 =====
model Site {
  id            String    @id @default(cuid())
  url           String
  name          String
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  createdAt     DateTime  @default(now())

  scans         Scan[]
  monitors      Monitor[]
  competitors   Competitor[]
}

// ===== 掃描系統 =====
model Scan {
  id            String    @id @default(cuid())
  siteId        String
  site          Site      @relation(fields: [siteId], references: [id])
  totalScore    Int
  status        ScanStatus @default(PENDING)
  createdAt     DateTime  @default(now())
  completedAt   DateTime?

  results       ScanResult[]
}

enum ScanStatus { PENDING RUNNING COMPLETED FAILED }

model ScanResult {
  id            String    @id @default(cuid())
  scanId        String
  scan          Scan      @relation(fields: [scanId], references: [id])
  indicator     String    // json_ld, llms_txt, og_tags, etc.
  score         Int       // 0-100
  status        String    // pass, warning, fail
  details       Json      // 具體檢測結果
  suggestion    String?   // 改善建議
  autoFixable   Boolean   @default(false)
  generatedCode String?   // 自動生成的修復程式碼
}

// ===== 內容系統 =====
model Content {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  title         String
  body          String    @db.Text
  type          ContentType
  language      String    @default("zh-TW")
  seoScore      Int?
  status        ContentStatus @default(DRAFT)
  publishedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  publications  Publication[]
}

enum ContentType { FAQ ARTICLE KNOWLEDGE_BASE NEWS_RELEASE }
enum ContentStatus { DRAFT REVIEW PUBLISHED ARCHIVED }

// ===== 多平台發布 =====
model Publication {
  id            String    @id @default(cuid())
  contentId     String
  content       Content   @relation(fields: [contentId], references: [id])
  platform      String    // medium, linkedin, wordpress, etc.
  externalUrl   String?
  status        PublishStatus @default(PENDING)
  publishedAt   DateTime?
  metrics       Json?     // 觀看數、互動數等
}

enum PublishStatus { PENDING PUBLISHING PUBLISHED FAILED }

// ===== AI 引用監控 =====
model Monitor {
  id            String    @id @default(cuid())
  siteId        String
  site          Site      @relation(fields: [siteId], references: [id])
  platform      String    // chatgpt, claude, perplexity, gemini
  query         String    // 監控的查詢問題
  mentioned     Boolean   @default(false)
  position      Int?      // 被引用的位置/排名
  response      String?   @db.Text
  checkedAt     DateTime  @default(now())
}

// ===== 競品追蹤 =====
model Competitor {
  id            String    @id @default(cuid())
  siteId        String
  site          Site      @relation(fields: [siteId], references: [id])
  competitorUrl String
  name          String
  latestScore   Int?
  trackedSince  DateTime  @default(now())
}
```

---

## 四、API 設計概覽

### 認證
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me
POST   /api/auth/oauth/:provider
```

### 網站管理
```
GET    /api/sites
POST   /api/sites
GET    /api/sites/:id
PUT    /api/sites/:id
DELETE /api/sites/:id
```

### 掃描
```
POST   /api/sites/:id/scans          (觸發掃描)
GET    /api/sites/:id/scans          (掃描歷史)
GET    /api/scans/:id                (掃描詳情)
GET    /api/scans/:id/results        (各指標結果)
POST   /api/scans/:id/fix/:indicator (自動修復)
```

### 內容
```
GET    /api/contents
POST   /api/contents/generate        (AI 生成)
GET    /api/contents/:id
PUT    /api/contents/:id
DELETE /api/contents/:id
POST   /api/contents/:id/publish     (發布到平台)
```

### 監控
```
GET    /api/sites/:id/monitors
POST   /api/sites/:id/monitors       (新增監控查詢)
GET    /api/monitors/dashboard        (監控儀表板)
GET    /api/sites/:id/competitors     (競品分析)
```

### 報告
```
GET    /api/sites/:id/reports
POST   /api/sites/:id/reports/generate
GET    /api/reports/:id/download
```

---

## 五、安全架構

| 層級 | 措施 |
|------|------|
| 認證 | JWT + Refresh Token、OAuth 2.0 |
| 授權 | RBAC 角色權限、資源所有權驗證 |
| 傳輸 | HTTPS 強制、HSTS |
| API | Rate Limiting、Request Validation |
| 資料 | 密碼 bcrypt 雜湊、敏感資料加密 |
| 注入防護 | Prisma 參數化查詢、輸入消毒 |
| XSS | CSP Header、輸出轉義 |
| CSRF | SameSite Cookie、CSRF Token |
| 依賴 | npm audit 定期掃描、Dependabot |

---

## 六、效能目標

| 指標 | 目標 |
|------|------|
| API 回應 (P50) | < 200ms |
| API 回應 (P95) | < 500ms |
| 掃描完成時間 | < 30s |
| 頁面 LCP | < 2.5s |
| 頁面 FID | < 100ms |
| 首頁 TTI | < 3s |
| 並發掃描數 | 100+ |
| 系統可用性 | 99.9% |
