-- Store the customer's CMS collection URL separately from the final article
-- canonical URL so future articles can reuse the confirmed publish location.
ALTER TABLE "official_site_articles"
  ADD COLUMN "publishBaseUrl" TEXT;
