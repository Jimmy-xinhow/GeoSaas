CREATE TABLE "support_knowledge_items" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "question" TEXT,
  "answer" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_knowledge_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_conversation_summaries" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "site_id" TEXT,
  "category" TEXT NOT NULL DEFAULT 'general',
  "summary" TEXT NOT NULL,
  "resolution" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_conversation_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_conversation_summaries_conversation_id_key"
  ON "support_conversation_summaries"("conversation_id");
CREATE INDEX "support_knowledge_items_enabled_category_priority_idx"
  ON "support_knowledge_items"("enabled", "category", "priority");
CREATE INDEX "support_knowledge_items_tags_idx"
  ON "support_knowledge_items" USING GIN ("tags");
CREATE INDEX "support_conversation_summaries_user_id_created_at_idx"
  ON "support_conversation_summaries"("user_id", "created_at");
CREATE INDEX "support_conversation_summaries_site_id_created_at_idx"
  ON "support_conversation_summaries"("site_id", "created_at");
CREATE INDEX "support_conversation_summaries_category_created_at_idx"
  ON "support_conversation_summaries"("category", "created_at");

ALTER TABLE "support_knowledge_items"
  ADD CONSTRAINT "support_knowledge_items_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_conversation_summaries"
  ADD CONSTRAINT "support_conversation_summaries_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_conversation_summaries"
  ADD CONSTRAINT "support_conversation_summaries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_conversation_summaries"
  ADD CONSTRAINT "support_conversation_summaries_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "support_knowledge_items"
  ("id", "title", "category", "question", "answer", "tags", "priority", "created_at", "updated_at")
VALUES
  (
    'support-kb-geo-score',
    'GEO 分數與 AI 引用基礎說明',
    'scan',
    'GEO 分數代表什麼？',
    'GEO 分數用來評估網站是否容易被 AI 搜尋與生成式答案理解、引用。常見重點包含 JSON-LD、llms.txt、Open Graph、Meta Description、FAQ Schema、標題、聯絡資訊與圖片 Alt。分數越高，代表 AI 更容易辨識品牌、服務、地區與可信資料，但不保證任何特定 AI 一定引用。',
    ARRAY['geo-score','scan','ai-citation'],
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'support-kb-llms',
    'llms.txt 客服說明',
    'llms',
    'llms.txt 是什麼？',
    'llms.txt 是提供給 AI crawler 讀取的機器可讀摘要，通常放在網站根目錄 /llms.txt。Geovault 可以代管或產生建議內容。若客戶問為什麼 AI 還沒引用，應先確認網站是否公開、robots 是否允許、llms.txt 是否可讀、內容是否具體，以及是否已有 AI crawler 實際造訪紀錄。',
    ARRAY['llms.txt','crawler','ai-crawler'],
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'support-kb-plan',
    '方案客服處理規則',
    'billing',
    '不同方案客服怎麼處理？',
    'FREE 方案以工單處理；STARTER 方案以站內訊息為主；PRO 方案可標記為較高優先度與即時處理。若涉及付款、退款、發票、帳號安全、正式環境部署或資料刪除，AI 必須轉人工處理。',
    ARRAY['plan','billing','handoff'],
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
