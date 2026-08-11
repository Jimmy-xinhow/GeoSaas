ALTER TABLE "client_query_sets"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "contentHash" TEXT;

ALTER TABLE "monitor_reports"
ADD COLUMN "querySetVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "querySnapshot" JSONB,
ADD COLUMN "expectedChecks" INTEGER NOT NULL DEFAULT 0;
