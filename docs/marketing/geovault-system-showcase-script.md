# Geovault System Showcase Film

展示頁：`apps/web/public/demos/geovault-system-showcase.html`

第二版展示頁：`apps/web/public/demos/geovault-system-showcase-v2.html`

## Production Notes

- V2 為 45 秒 FB 投放廣告版 HTML 操作動畫，節奏比簡報版更快。
- 首尾使用專案內 `GeovaultLogoFullDark` 匯出的正式品牌 Logo，不使用另刻 Logo。
- 介面素材以目前專案 route 的真實畫面為準；`AI 引用監控` 已重新由目前 `/monitor` route 擷取，不再用 2026-05-19 舊截圖。
- 監控數據只透過 demo API mock 注入，保留目前 dashboard UI 結構，不再覆蓋自製監控卡片。
- 字幕固定在中間下方，採電影字幕樣式：中文在上、英文較小在下。
- V2 已移除口白、BGM 與音效，適合 FB 靜音自動播放情境。
- V2 左上角常駐正式 Geovault Logo，39.6s 改成聯盟行銷推廣收束；右側使用 `imagegen` SKILL 生成的點陣 PNG 作為融合背景，不用外框包圖，並以非 SVG 的 CSS 光流讓螢幕連線動起來。

## Assets

- `apps/web/public/demos/assets/geovault-logo-full-dark.svg`
- `apps/web/public/demos/assets/publish-sidebar.png`
- `apps/web/public/demos/assets/content-engine.png`
- `apps/web/public/demos/assets/monitor-grouping-demo.png`
- `apps/web/public/demos/assets/geovault-alliance-ai-visibility.png`

## 45 秒 FB 廣告版腳本

### 0-3s Brand Hook

畫面：黑底漸進，正式 Geovault Logo 與標語出現。

字幕：你的品牌 AI 找得到嗎 / Can AI find your brand?

### 3-9s Free Scan

畫面：免費掃描介面進場，右側以流程面板呈現掃描正在執行。

字幕：免費掃描 直接看見 AI 讀不懂哪裡 / Run a free scan and find the gaps

### 9.5-17s Content Engine

畫面：內容引擎真實截圖，呈現 FAQ、品牌文章、AI 可引用摘要進入知識庫。

字幕：內容自動變成 AI 可引用資料層 / Turn content into AI-citable data

### 17-24.75s Citation Monitor

畫面：目前 `/monitor` route 的最新 AI 引用監控介面，使用漂亮 demo 數據。

字幕：ChatGPT Perplexity Claude 引用率直接追 / Track AI citations across platforms

### 24.75-32s Distribution

畫面：多平台發布工作流，Medium、LinkedIn、WordPress、Google 商家同步推進。

字幕：發布到多平台 讓資料層持續擴散 / Push brand data across channels

### 32-39.6s GEO Operating System

畫面：主標題切到「一體化成型的 GEO 經營系統」，掃描、建置、發布、證明四段流程快速串起。

字幕：一體化成型的 GEO 經營系統 / One operating system for GEO growth

### 39.6-43.2s Alliance CTA Transition

畫面：左側呼籲加入聯盟行銷，一起推廣 Geovault；右側使用 `imagegen` 產出的高端點陣圖融合進背景，並用動態光流覆蓋在螢幕連線上，呈現網站、AI 核心、資料流與抓取路徑。

字幕：加入聯盟行銷 一起把好系統推廣出去 / Join the alliance and grow AI visibility together

### 43.2-45s Brand Close

畫面：黑底收束到正式 Logo、加入 Geovault 聯盟、一起推廣好系統 CTA。

字幕：加入聯盟行銷 一起把好系統推廣出去 / Join the alliance and grow AI visibility together

## 驗證方式

```bash
node tmp/showcase-monitor-latest.cjs
node -e "const fs=require('fs'); const html=fs.readFileSync('apps/web/public/demos/geovault-system-showcase.html','utf8'); const scripts=html.match(/<script>[\\s\\S]*?<\\/script>/g)||[]; for (const tag of scripts){ const s=tag.replace(/^<script>/,'').replace(/<\\/script>$/,''); new Function(s); } console.log('scripts ok')"
```

## V2 Layout

- 左側為主敘事文字，右側為真實系統截圖。
- 右側圖片停滯時顯示真實流程正在運作：掃描檢查清單、內容生成流、引用監控比對、發布佇列、GEO 閉環狀態。
- 不使用游標點擊來假裝操作；操作感來自流程本身的狀態更新。
- 節奏改為 45 秒 FB 廣告版：前 3 秒丟出問題，3-39.6 秒快速展示系統流程，39.6-43.2 秒用操作卡做 CTA，最後 1.8 秒品牌收束。
- 字幕維持電影字幕樣式：中文在上、英文在下，英文較小。
- 已移除播放口白 / BGM 按鈕與相關程式碼。
- V2 驗證截圖：
  - `tmp/geovault-showcase-v2-6.png`
  - `tmp/geovault-showcase-v2-14.png`
  - `tmp/geovault-showcase-v2-24.png`
  - `tmp/geovault-showcase-v2-35.png`
  - `tmp/geovault-showcase-v2-45.png`
  - `tmp/geovault-showcase-v2-53.png`
  - `tmp/geovault-showcase-v2-58.png`
