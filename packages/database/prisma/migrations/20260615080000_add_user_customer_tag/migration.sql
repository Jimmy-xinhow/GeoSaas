ALTER TABLE "users" ADD COLUMN "is_customer" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_is_customer_idx" ON "users"("is_customer");
