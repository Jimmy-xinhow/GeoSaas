CREATE INDEX IF NOT EXISTS "sites_isPublic_bestScore_idx" ON "sites"("isPublic", "bestScore");
CREATE INDEX IF NOT EXISTS "sites_industry_isPublic_bestScore_idx" ON "sites"("industry", "isPublic", "bestScore");
CREATE INDEX IF NOT EXISTS "sites_isClient_isPublic_updatedAt_idx" ON "sites"("isClient", "isPublic", "updatedAt");
CREATE INDEX IF NOT EXISTS "sites_createdAt_idx" ON "sites"("createdAt");

CREATE INDEX IF NOT EXISTS "scans_siteId_status_completedAt_idx" ON "scans"("siteId", "status", "completedAt");
CREATE INDEX IF NOT EXISTS "scans_status_completedAt_idx" ON "scans"("status", "completedAt");

CREATE INDEX IF NOT EXISTS "crawler_visits_isSeeded_visitedAt_idx" ON "crawler_visits"("isSeeded", "visitedAt");
CREATE INDEX IF NOT EXISTS "crawler_visits_isSeeded_botName_idx" ON "crawler_visits"("isSeeded", "botName");
