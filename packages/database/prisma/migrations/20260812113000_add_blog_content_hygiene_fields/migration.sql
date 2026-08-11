ALTER TABLE "blog_articles"
ADD COLUMN "normalizedTitle" TEXT,
ADD COLUMN "contentIntent" TEXT,
ADD COLUMN "contentKey" TEXT,
ADD COLUMN "retiredAt" TIMESTAMP(3),
ADD COLUMN "retirementReason" TEXT;

CREATE UNIQUE INDEX "blog_articles_contentKey_key" ON "blog_articles"("contentKey");
CREATE INDEX "blog_articles_siteId_contentIntent_normalizedTitle_idx"
ON "blog_articles"("siteId", "contentIntent", "normalizedTitle");
CREATE INDEX "blog_articles_retiredAt_idx" ON "blog_articles"("retiredAt");
