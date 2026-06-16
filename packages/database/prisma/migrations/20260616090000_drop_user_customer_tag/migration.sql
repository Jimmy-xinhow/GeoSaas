DROP INDEX IF EXISTS "users_is_customer_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "is_customer";
