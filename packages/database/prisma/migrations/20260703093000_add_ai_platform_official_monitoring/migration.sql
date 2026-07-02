-- Official AI-platform guidance snapshots and crawler-effectiveness audits.
CREATE TABLE "ai_platform_official_sources" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'official_guidance',
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastHash" TEXT,
  "lastFetchedAt" TIMESTAMP(3),
  "lastChangedAt" TIMESTAMP(3),
  "lastStatus" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_platform_official_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_platform_official_snapshots" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "title" TEXT,
  "summary" TEXT NOT NULL,
  "rawText" TEXT,
  "actionItems" JSONB,
  "appliedFixes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_platform_official_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "published_article_crawler_audits" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "templateType" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "last24h" INTEGER NOT NULL DEFAULT 0,
  "last7d" INTEGER NOT NULL DEFAULT 0,
  "last30d" INTEGER NOT NULL DEFAULT 0,
  "lastVisitAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "fixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "published_article_crawler_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_platform_official_sources_url_key" ON "ai_platform_official_sources"("url");
CREATE INDEX "ai_platform_official_sources_platform_enabled_idx" ON "ai_platform_official_sources"("platform", "enabled");
CREATE INDEX "ai_platform_official_sources_enabled_lastFetchedAt_idx" ON "ai_platform_official_sources"("enabled", "lastFetchedAt");

CREATE UNIQUE INDEX "ai_platform_official_snapshots_sourceId_hash_key" ON "ai_platform_official_snapshots"("sourceId", "hash");
CREATE INDEX "ai_platform_official_snapshots_platform_createdAt_idx" ON "ai_platform_official_snapshots"("platform", "createdAt");
CREATE INDEX "ai_platform_official_snapshots_sourceId_createdAt_idx" ON "ai_platform_official_snapshots"("sourceId", "createdAt");

CREATE INDEX "published_article_crawler_audits_articleId_createdAt_idx" ON "published_article_crawler_audits"("articleId", "createdAt");
CREATE INDEX "published_article_crawler_audits_status_createdAt_idx" ON "published_article_crawler_audits"("status", "createdAt");
CREATE INDEX "published_article_crawler_audits_slug_createdAt_idx" ON "published_article_crawler_audits"("slug", "createdAt");

ALTER TABLE "ai_platform_official_snapshots"
  ADD CONSTRAINT "ai_platform_official_snapshots_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ai_platform_official_sources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
