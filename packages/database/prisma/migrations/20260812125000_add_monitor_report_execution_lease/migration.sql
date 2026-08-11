ALTER TABLE "monitor_reports"
ADD COLUMN "executionLeaseId" TEXT,
ADD COLUMN "executionLeaseExpiresAt" TIMESTAMP(3);

-- Keep pre-deployment runners exclusive during the rolling container handoff.
-- The new worker will claim these reports after this short compatibility lease.
UPDATE "monitor_reports"
SET
  "executionLeaseId" = 'legacy-deployment-handoff',
  "executionLeaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
WHERE "status" = 'running';

CREATE INDEX "monitor_reports_status_executionLeaseExpiresAt_idx"
ON "monitor_reports"("status", "executionLeaseExpiresAt");
