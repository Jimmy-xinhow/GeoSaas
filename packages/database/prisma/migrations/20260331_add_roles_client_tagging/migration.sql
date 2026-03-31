-- AlterEnum: Remove ENTERPRISE from Plan
BEGIN;
CREATE TYPE "Plan_new" AS ENUM ('FREE', 'STARTER', 'PRO');
ALTER TABLE "users" ALTER COLUMN "plan" DROP DEFAULT;
-- Convert any ENTERPRISE users to PRO
UPDATE "users" SET "plan" = 'PRO' WHERE "plan" = 'ENTERPRISE';
ALTER TABLE "users" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
ALTER TYPE "Plan" RENAME TO "Plan_old";
ALTER TYPE "Plan_new" RENAME TO "Plan";
DROP TYPE "Plan_old";
ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'FREE';
COMMIT;

-- AlterEnum: Add STAFF and SUPER_ADMIN to UserRole
ALTER TYPE "UserRole" ADD VALUE 'STAFF';
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable: Add isClient to sites
ALTER TABLE "sites" ADD COLUMN "isClient" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add managedBy to users
ALTER TABLE "users" ADD COLUMN "managedBy" TEXT;

-- CreateIndex
CREATE INDEX "users_managedBy_idx" ON "users"("managedBy");
