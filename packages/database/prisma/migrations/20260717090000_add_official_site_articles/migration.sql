-- First-party official-site content is stored separately from Geovault
-- platform BlogArticle rows to prevent cross-domain duplicate exports.
CREATE TABLE "official_site_articles" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceArticleId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "targetQuestion" TEXT,
  "targetKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "canonicalUrl" TEXT,
  "metaTitle" TEXT,
  "metaDescription" TEXT,
  "articleSchema" JSONB,
  "faqSchema" JSONB,
  "firstPartySnapshot" JSONB,
  "qualityReport" JSONB,
  "similarityScore" DOUBLE PRECISION,
  "similarityMatchedArticleId" TEXT,
  "rejectionReason" TEXT,
  "publishedUrl" TEXT,
  "generatedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "exportedAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "verificationReport" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "official_site_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_site_articles_siteId_slug_key"
  ON "official_site_articles"("siteId", "slug");
CREATE INDEX "official_site_articles_siteId_status_updatedAt_idx"
  ON "official_site_articles"("siteId", "status", "updatedAt");
CREATE INDEX "official_site_articles_sourceArticleId_idx"
  ON "official_site_articles"("sourceArticleId");

ALTER TABLE "official_site_articles"
  ADD CONSTRAINT "official_site_articles_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "official_site_articles"
  ADD CONSTRAINT "official_site_articles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "official_site_articles"
  ADD CONSTRAINT "official_site_articles_sourceArticleId_fkey"
  FOREIGN KEY ("sourceArticleId") REFERENCES "blog_articles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
