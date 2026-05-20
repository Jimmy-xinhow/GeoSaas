export interface DefaultSupportKnowledgeItem {
  title: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  priority: number;
}

export const DEFAULT_SUPPORT_KNOWLEDGE: DefaultSupportKnowledgeItem[] = [
  {
    title: 'GEO 分數是什麼',
    category: 'scan',
    question: 'GEO 分數代表什麼？為什麼我的分數不高？',
    answer:
      'GEO 分數是 Geovault 用來評估網站是否容易被 ChatGPT、Claude、Gemini、Perplexity 等 AI 系統理解與引用的指標。它會看 JSON-LD、llms.txt、Open Graph、Meta Description、FAQ Schema、標題、聯絡資訊、圖片 Alt 等項目。分數低通常不是網站壞掉，而是 AI 缺少可讀、可信、可引用的資料。建議先從缺少的高權重項目開始補，例如 JSON-LD、llms.txt 與 FAQ Schema。',
    tags: ['geo', 'scan', 'score', 'ai-citation'],
    priority: 1000,
  },
  {
    title: '掃描後分數沒有立刻提升',
    category: 'scan',
    question: '我已經修了網站，為什麼掃描分數還沒變？',
    answer:
      '分數不變通常有三種原因：第一，網站快取或 CDN 還沒更新；第二，修正沒有部署到正式網址；第三，修正項目不是本次扣分的主要原因。請先確認正式網址能看到新內容，再重新掃描。如果是 JSON-LD、FAQ Schema 或 llms.txt，建議用網站詳情頁的修復建議逐項對照。若重新掃描後仍異常，請提供網站網址、修正項目與最近一次掃描時間，客服可以協助判斷。',
    tags: ['scan', 'cache', 'deployment', 'score'],
    priority: 950,
  },
  {
    title: 'llms.txt 的用途',
    category: 'llms',
    question: 'llms.txt 是什麼？一定要設定嗎？',
    answer:
      'llms.txt 是提供給 AI 爬蟲與大型語言模型閱讀的機器可讀檔案，作用類似「給 AI 的品牌資料入口」。它可以整理品牌介紹、服務、重要頁面、常見問題與引用規則。它不是傳統 SEO 的必要檔案，但對 GEO 很重要，因為 AI 需要清楚、可信、可整理的資料來源。建議至少包含品牌名稱、官方網站、服務範圍、目標客群、FAQ 與聯絡方式。',
    tags: ['llms.txt', 'ai-crawler', 'geo'],
    priority: 1000,
  },
  {
    title: 'llms-full.txt 與平台目錄',
    category: 'llms',
    question: 'llms-full.txt 跟我的網站 llms.txt 有什麼不同？',
    answer:
      '單一網站的 llms.txt 是品牌自己的 AI 可讀資料；平台的 llms-full.txt 則是 Geovault 將公開品牌、GEO 分數、行業分類、強項與常見問答整理成完整目錄。前者幫 AI 理解單一品牌，後者幫 AI 從多個品牌中比較與引用。若你的網站資料完整、公開狀態正確，平台目錄會增加被 AI 發現的機會。',
    tags: ['llms-full', 'directory', 'ai-citation'],
    priority: 920,
  },
  {
    title: '內容引擎生成前資料門檻',
    category: 'content',
    question: '為什麼內容引擎說品牌資料或知識庫不足，不能生成？',
    answer:
      '內容引擎會先檢查品牌資料與知識庫，資料不足時會直接禁止生成，不會呼叫 AI，也不會扣點。這是為了避免產生空泛或錯誤內容。最低要求包含品牌名稱、官方網站、產業分類、品牌描述、服務或產品說明、品牌定位或差異化、目標客群，以及至少 2 組有效知識庫 Q&A。補齊後再生成，內容品質與可引用性會更穩定。',
    tags: ['content', 'credits', 'knowledge-base', 'guardrail'],
    priority: 1000,
  },
  {
    title: '內容引擎扣點規則',
    category: 'billing',
    question: 'AI 內容生成什麼時候會扣點？失敗會退點嗎？',
    answer:
      '內容生成會在通過權限、品牌資料完整度、AI 設定與可用額度檢查後才會預留點數。若品牌資料不足，會在扣點前被擋下。若已扣點但後續 AI 或儲存流程失敗，系統會走退款機制，把本次預留的點數退回。這樣可以避免因系統錯誤造成用戶點數爭議。',
    tags: ['billing', 'credits', 'content'],
    priority: 930,
  },
  {
    title: '方案與客服處理優先級',
    category: 'billing',
    question: 'FREE、STARTER、PRO 的客服差異是什麼？',
    answer:
      'FREE 方案主要以工單方式處理，STARTER 方案適合站內訊息支援，PRO 方案會優先進入高即時性處理。AI 客服會先協助整理問題、提供可立即操作的建議；涉及帳務、付款、權限、資料異常、PRO 用戶或不確定答案時，會標記需要人工客服接手。',
    tags: ['plan', 'support', 'billing'],
    priority: 900,
  },
  {
    title: 'AI 爬蟲數據變少',
    category: 'crawler',
    question: '為什麼 AI 爬蟲數據越來越少？',
    answer:
      'AI 爬蟲數據變少常見原因包含 robots.txt 阻擋、llms.txt 不完整、公開目錄資料不足、內容更新頻率下降、頁面缺少結構化資料，或正式環境仍開啟模擬資料導致判讀混亂。正式環境應確認 ENABLE_CRAWLER_SIMULATION=0。建議優先檢查 robots.txt、llms.txt、sitemap、公開目錄狀態、最近掃描結果與 crawler tracking snippet 是否正常安裝。',
    tags: ['crawler', 'robots.txt', 'llms.txt', 'simulation'],
    priority: 1000,
  },
  {
    title: 'Badge 的用途與安裝',
    category: 'integration',
    question: 'GEO Badge 可以做什麼？要怎麼放到網站？',
    answer:
      'GEO Badge 可以把網站目前的 GEO Score 以可嵌入圖片或 Markdown 的方式放在官網、README、部落格或合作頁面。它的作用是建立可信訊號，也讓 AI 與使用者更容易知道該品牌已被 Geovault 檢測。一般 HTML 可貼在頁面區塊中，WordPress 可放在自訂 HTML 小工具，Webflow 可用 Embed 元素。',
    tags: ['badge', 'integration', 'trust'],
    priority: 850,
  },
  {
    title: '多平台發布定位',
    category: 'integration',
    question: '多平台發布是不是 Geovault 直接幫我發到所有平台？',
    answer:
      '多平台發布的定位是讓使用者串接自己的 Medium、LinkedIn、WordPress、方格子、Facebook 或 Google 商家檔案帳號，形成 CMS 到外部平台的發布流程。Geovault 不會替使用者憑空擁有平台權限；需要由使用者提供或授權自己的平台資源。尚未串接的平台會顯示缺少的環境變數或授權狀態。',
    tags: ['publish', 'cms', 'integration'],
    priority: 880,
  },
  {
    title: '聯盟行銷級距',
    category: 'affiliate',
    question: '聯盟行銷佣金怎麼算？',
    answer:
      '目前規劃的聯盟行銷級距是標準 10%、金牌 15%、白金 20%。後台需要能統一管理級距、條件、佣金紀錄、付款狀態與推薦連結。當被推薦用戶完成有效付費後，系統會建立佣金紀錄；若付款退款或取消，則應依規則追回或標記 clawback。',
    tags: ['affiliate', 'commission', 'referral'],
    priority: 860,
  },
  {
    title: 'AI 客服接手邊界',
    category: 'general',
    question: 'AI 客服什麼時候應該請人工接手？',
    answer:
      'AI 客服遇到付款爭議、帳號權限、資料刪除、部署失敗、正式環境異常、用戶情緒明顯不滿、PRO 用戶即時處理、或知識庫沒有明確答案時，都應該標記 requiresHuman=true 並請人工客服接手。AI 可以先整理問題、要求必要資訊、提供初步排查，但不能假裝已完成人工處理。',
    tags: ['handoff', 'support', 'policy'],
    priority: 1000,
  },
];
