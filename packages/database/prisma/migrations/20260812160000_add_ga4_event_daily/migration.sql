CREATE TABLE "ga4_event_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "propertyId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "keyEvents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ga4_event_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ga4_event_daily_date_propertyId_eventName_key" ON "ga4_event_daily"("date", "propertyId", "eventName");
CREATE INDEX "ga4_event_daily_date_propertyId_idx" ON "ga4_event_daily"("date", "propertyId");
CREATE INDEX "ga4_event_daily_eventName_date_idx" ON "ga4_event_daily"("eventName", "date");
