-- Affiliate attribution on users
ALTER TABLE "users"
  ADD COLUMN "affiliate_referrer_id" TEXT;

-- Affiliate partners
CREATE TABLE "affiliates" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "real_name" TEXT NOT NULL,
  "contact_email" TEXT,
  "website_url" TEXT,
  "promotion_channel" TEXT,
  "audience_description" TEXT,
  "payout_method" TEXT NOT NULL DEFAULT 'bank_transfer',
  "bank_name" TEXT,
  "bank_branch" TEXT,
  "bank_account_number" TEXT,
  "bank_account_name" TEXT,
  "affiliate_code" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'standard',
  "commission_rate" INTEGER NOT NULL DEFAULT 20,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "rejection_reason" TEXT,
  "total_clicks" INTEGER NOT NULL DEFAULT 0,
  "total_signups" INTEGER NOT NULL DEFAULT 0,
  "total_conversions" INTEGER NOT NULL DEFAULT 0,
  "total_commission_earned" INTEGER NOT NULL DEFAULT 0,
  "total_commission_paid" INTEGER NOT NULL DEFAULT 0,
  "pending_commission" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_clicks" (
  "id" TEXT NOT NULL,
  "affiliate_id" TEXT NOT NULL,
  "affiliate_code" TEXT NOT NULL,
  "visitor_id" TEXT NOT NULL,
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "landing_page" TEXT,
  "converted_user_id" TEXT,
  "converted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_commissions" (
  "id" TEXT NOT NULL,
  "affiliate_id" TEXT NOT NULL,
  "affiliate_user_id" TEXT NOT NULL,
  "referred_user_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "payment_amount" INTEGER NOT NULL,
  "commission_rate" INTEGER NOT NULL,
  "commission_amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "locked_until" TIMESTAMP(3) NOT NULL,
  "withdrawal_id" TEXT,
  "clawback_reason" TEXT,
  "clawback_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "affiliate_withdrawals" (
  "id" TEXT NOT NULL,
  "affiliate_id" TEXT NOT NULL,
  "affiliate_user_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'bank_transfer',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "bank_snapshot" JSONB,
  "processed_by_id" TEXT,
  "processed_at" TIMESTAMP(3),
  "process_note" TEXT,
  "rejection_reason" TEXT,
  "tax_year" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "affiliate_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliates_user_id_key" ON "affiliates"("user_id");
CREATE UNIQUE INDEX "affiliates_affiliate_code_key" ON "affiliates"("affiliate_code");
CREATE INDEX "affiliates_status_idx" ON "affiliates"("status");
CREATE INDEX "users_affiliate_referrer_id_idx" ON "users"("affiliate_referrer_id");

CREATE INDEX "affiliate_clicks_affiliate_id_created_at_idx" ON "affiliate_clicks"("affiliate_id", "created_at");
CREATE INDEX "affiliate_clicks_affiliate_code_visitor_id_created_at_idx" ON "affiliate_clicks"("affiliate_code", "visitor_id", "created_at");
CREATE INDEX "affiliate_clicks_converted_user_id_idx" ON "affiliate_clicks"("converted_user_id");

CREATE UNIQUE INDEX "affiliate_commissions_order_id_key" ON "affiliate_commissions"("order_id");
CREATE INDEX "affiliate_commissions_affiliate_id_created_at_idx" ON "affiliate_commissions"("affiliate_id", "created_at");
CREATE INDEX "affiliate_commissions_affiliate_user_id_status_idx" ON "affiliate_commissions"("affiliate_user_id", "status");
CREATE INDEX "affiliate_commissions_referred_user_id_idx" ON "affiliate_commissions"("referred_user_id");
CREATE INDEX "affiliate_commissions_status_affiliate_id_idx" ON "affiliate_commissions"("status", "affiliate_id");

CREATE INDEX "affiliate_withdrawals_affiliate_id_created_at_idx" ON "affiliate_withdrawals"("affiliate_id", "created_at");
CREATE INDEX "affiliate_withdrawals_status_idx" ON "affiliate_withdrawals"("status");
CREATE INDEX "affiliate_withdrawals_tax_year_affiliate_user_id_idx" ON "affiliate_withdrawals"("tax_year", "affiliate_user_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_affiliate_referrer_id_fkey"
  FOREIGN KEY ("affiliate_referrer_id") REFERENCES "affiliates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliates"
  ADD CONSTRAINT "affiliates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_clicks"
  ADD CONSTRAINT "affiliate_clicks_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_affiliate_user_id_fkey"
  FOREIGN KEY ("affiliate_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_withdrawal_id_fkey"
  FOREIGN KEY ("withdrawal_id") REFERENCES "affiliate_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliate_withdrawals"
  ADD CONSTRAINT "affiliate_withdrawals_affiliate_id_fkey"
  FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_withdrawals"
  ADD CONSTRAINT "affiliate_withdrawals_affiliate_user_id_fkey"
  FOREIGN KEY ("affiliate_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
