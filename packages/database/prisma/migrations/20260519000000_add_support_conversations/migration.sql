CREATE TABLE "support_conversations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "site_id" TEXT,
  "assigned_admin_id" TEXT,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "channel" TEXT NOT NULL DEFAULT 'ticket',
  "plan_snapshot" TEXT NOT NULL DEFAULT 'FREE',
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_id" TEXT,
  "sender_role" TEXT NOT NULL DEFAULT 'user',
  "body" TEXT NOT NULL,
  "is_ai" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_conversations_user_id_status_last_message_at_idx" ON "support_conversations"("user_id", "status", "last_message_at");
CREATE INDEX "support_conversations_status_priority_last_message_at_idx" ON "support_conversations"("status", "priority", "last_message_at");
CREATE INDEX "support_conversations_assigned_admin_id_status_idx" ON "support_conversations"("assigned_admin_id", "status");
CREATE INDEX "support_conversations_site_id_idx" ON "support_conversations"("site_id");
CREATE INDEX "support_messages_conversation_id_created_at_idx" ON "support_messages"("conversation_id", "created_at");
CREATE INDEX "support_messages_sender_id_created_at_idx" ON "support_messages"("sender_id", "created_at");

ALTER TABLE "support_conversations"
  ADD CONSTRAINT "support_conversations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_conversations"
  ADD CONSTRAINT "support_conversations_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_conversations"
  ADD CONSTRAINT "support_conversations_assigned_admin_id_fkey"
  FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
