CREATE TABLE "cms_connections" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'wordpress',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "apiBaseUrl" TEXT,
  "pluginTokenHash" TEXT NOT NULL,
  "tokenLast4" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cms_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_fix_runs" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "connectionId" TEXT,
  "requestedById" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'wordpress_plugin',
  "status" TEXT NOT NULL DEFAULT 'planned',
  "summary" JSONB,
  "error" TEXT,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_fix_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_fix_actions" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "scanResultId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payload" JSONB NOT NULL,
  "generatedCode" TEXT,
  "pluginAppliedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_fix_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_connections_pluginTokenHash_key" ON "cms_connections"("pluginTokenHash");
CREATE UNIQUE INDEX "cms_connections_siteId_provider_key" ON "cms_connections"("siteId", "provider");
CREATE INDEX "cms_connections_userId_idx" ON "cms_connections"("userId");
CREATE INDEX "cms_connections_status_updatedAt_idx" ON "cms_connections"("status", "updatedAt");
CREATE INDEX "site_fix_runs_siteId_createdAt_idx" ON "site_fix_runs"("siteId", "createdAt");
CREATE INDEX "site_fix_runs_connectionId_status_idx" ON "site_fix_runs"("connectionId", "status");
CREATE INDEX "site_fix_runs_requestedById_createdAt_idx" ON "site_fix_runs"("requestedById", "createdAt");
CREATE INDEX "site_fix_actions_runId_status_idx" ON "site_fix_actions"("runId", "status");
CREATE INDEX "site_fix_actions_siteId_status_idx" ON "site_fix_actions"("siteId", "status");
CREATE INDEX "site_fix_actions_scanResultId_idx" ON "site_fix_actions"("scanResultId");

ALTER TABLE "cms_connections"
  ADD CONSTRAINT "cms_connections_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_connections"
  ADD CONSTRAINT "cms_connections_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_fix_runs"
  ADD CONSTRAINT "site_fix_runs_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_fix_runs"
  ADD CONSTRAINT "site_fix_runs_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "cms_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "site_fix_runs"
  ADD CONSTRAINT "site_fix_runs_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_fix_actions"
  ADD CONSTRAINT "site_fix_actions_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "site_fix_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_fix_actions"
  ADD CONSTRAINT "site_fix_actions_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_fix_actions"
  ADD CONSTRAINT "site_fix_actions_scanResultId_fkey"
  FOREIGN KEY ("scanResultId") REFERENCES "scan_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
