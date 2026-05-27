-- Add manual plan-grant tracking for admin promotional adjustments.
ALTER TABLE "users"
  ADD COLUMN "plan_expires_at" TIMESTAMP(3),
  ADD COLUMN "plan_source" TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE "plan_grants" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "granted_by_id" TEXT,
  "plan" "Plan" NOT NULL,
  "days" INTEGER NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "previous_plan" "Plan" NOT NULL,
  "previous_plan_expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "plan_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "users_plan_expires_at_idx" ON "users"("plan_expires_at");
CREATE INDEX "plan_grants_user_id_expires_at_idx" ON "plan_grants"("user_id", "expires_at");
CREATE INDEX "plan_grants_granted_by_id_created_at_idx" ON "plan_grants"("granted_by_id", "created_at");

ALTER TABLE "plan_grants"
  ADD CONSTRAINT "plan_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_grants"
  ADD CONSTRAINT "plan_grants_granted_by_id_fkey"
  FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
