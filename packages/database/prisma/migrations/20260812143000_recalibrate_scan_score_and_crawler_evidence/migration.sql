ALTER TABLE "sites"
ADD COLUMN "scoreVersion" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "scans"
ADD COLUMN "scoreVersion" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "crawler_visits"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
ADD COLUMN "verificationMethod" TEXT;

-- Historical rows only proved that a non-simulated request used a matching
-- User-Agent. Preserve that evidence without relabelling it as provider-verified.
UPDATE "crawler_visits"
SET
  "verificationStatus" = CASE WHEN "isSeeded" THEN 'seeded' ELSE 'ua_only' END,
  "verificationMethod" = CASE WHEN "isSeeded" THEN 'simulation' ELSE 'user_agent' END;

CREATE INDEX "crawler_visits_verificationStatus_visitedAt_idx"
ON "crawler_visits"("verificationStatus", "visitedAt");

UPDATE "site_badges"
SET "label" = 'UA 辨識 crawler 請求'
WHERE "badge" = 'crawler_visited';

-- Score algorithm v2: llms.txt is an optional 5-point convention and the
-- complete nine-indicator weight set totals 100. Recalculate every historical
-- scan from its persisted indicator results so trend charts never mix v1/v2.
WITH recalculated AS (
  SELECT
    sr."scanId",
    ROUND(
      SUM(
        sr."score" * CASE sr."indicator"
          WHEN 'json_ld' THEN 15
          WHEN 'llms_txt' THEN 5
          WHEN 'og_tags' THEN 10
          WHEN 'meta_description' THEN 10
          WHEN 'faq_schema' THEN 15
          WHEN 'title_optimization' THEN 10
          WHEN 'contact_info' THEN 10
          WHEN 'image_alt' THEN 10
          WHEN 'robots_ai' THEN 15
          ELSE 10
        END
      )::numeric
      / NULLIF(
          SUM(
            CASE sr."indicator"
              WHEN 'json_ld' THEN 15
              WHEN 'llms_txt' THEN 5
              WHEN 'og_tags' THEN 10
              WHEN 'meta_description' THEN 10
              WHEN 'faq_schema' THEN 15
              WHEN 'title_optimization' THEN 10
              WHEN 'contact_info' THEN 10
              WHEN 'image_alt' THEN 10
              WHEN 'robots_ai' THEN 15
              ELSE 10
            END
          ),
          0
        )
    )::integer AS "totalScore"
  FROM "scan_results" sr
  GROUP BY sr."scanId"
)
UPDATE "scans" s
SET
  "totalScore" = recalculated."totalScore",
  "scoreVersion" = 2
FROM recalculated
WHERE s."id" = recalculated."scanId";

-- Site.bestScore is the latest completed scan in the application despite its
-- legacy name. Rebuild it from the same recalculated source of truth.
WITH latest_completed AS (
  SELECT DISTINCT ON (s."siteId")
    s."siteId",
    s."totalScore",
    s."scoreVersion",
    s."completedAt",
    s."createdAt"
  FROM "scans" s
  WHERE s."status" = 'COMPLETED'
  ORDER BY s."siteId", s."completedAt" DESC NULLS LAST, s."createdAt" DESC
)
UPDATE "sites" site
SET
  "bestScore" = latest."totalScore",
  "bestScoreAt" = COALESCE(latest."completedAt", latest."createdAt"),
  "scoreVersion" = latest."scoreVersion",
  "tier" = CASE
    WHEN latest."totalScore" >= 80 THEN 'gold'
    WHEN latest."totalScore" >= 70 THEN 'silver'
    WHEN latest."totalScore" >= 60 THEN 'bronze'
    ELSE NULL
  END
FROM latest_completed latest
WHERE site."id" = latest."siteId";
