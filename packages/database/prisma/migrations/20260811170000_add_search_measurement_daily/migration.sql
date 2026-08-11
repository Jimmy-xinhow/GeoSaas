CREATE TABLE "search_performance_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "searchType" TEXT NOT NULL DEFAULT 'web',
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataState" TEXT NOT NULL DEFAULT 'final',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_performance_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ga4_landing_page_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "propertyId" TEXT NOT NULL,
    "landingPage" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "engagedSessions" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "screenPageViews" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "keyEvents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga4_landing_page_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_sync_states" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'never',
    "lastStartedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastDateFrom" DATE,
    "lastDateTo" DATE,
    "lastRowCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "analytics_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_performance_daily_date_siteUrl_page_query_country_device_searchType_key" ON "search_performance_daily"("date", "siteUrl", "page", "query", "country", "device", "searchType");
CREATE INDEX "search_performance_daily_date_siteUrl_idx" ON "search_performance_daily"("date", "siteUrl");
CREATE INDEX "search_performance_daily_page_date_idx" ON "search_performance_daily"("page", "date");
CREATE INDEX "search_performance_daily_query_date_idx" ON "search_performance_daily"("query", "date");

CREATE UNIQUE INDEX "ga4_landing_page_daily_date_propertyId_landingPage_source_medium_key" ON "ga4_landing_page_daily"("date", "propertyId", "landingPage", "source", "medium");
CREATE INDEX "ga4_landing_page_daily_date_propertyId_idx" ON "ga4_landing_page_daily"("date", "propertyId");
CREATE INDEX "ga4_landing_page_daily_landingPage_date_idx" ON "ga4_landing_page_daily"("landingPage", "date");

CREATE UNIQUE INDEX "analytics_sync_states_provider_key" ON "analytics_sync_states"("provider");
CREATE INDEX "analytics_sync_states_status_updatedAt_idx" ON "analytics_sync_states"("status", "updatedAt");
