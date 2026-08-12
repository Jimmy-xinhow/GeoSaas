-- Customer-site CMS accounts are isolated from Geovault platform users.
CREATE TABLE "site_cms_accounts" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_cms_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_cms_sessions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_cms_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_cms_articles" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverImageUrl" TEXT,
    "coverAlt" TEXT,
    "author" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "keyTakeaways" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faq" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_cms_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_cms_audit_logs" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "accountId" TEXT,
    "articleId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_cms_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_cms_accounts_siteId_username_key" ON "site_cms_accounts"("siteId", "username");
CREATE INDEX "site_cms_accounts_siteId_isActive_idx" ON "site_cms_accounts"("siteId", "isActive");
CREATE UNIQUE INDEX "site_cms_sessions_tokenHash_key" ON "site_cms_sessions"("tokenHash");
CREATE INDEX "site_cms_sessions_accountId_expiresAt_idx" ON "site_cms_sessions"("accountId", "expiresAt");
CREATE INDEX "site_cms_sessions_expiresAt_revokedAt_idx" ON "site_cms_sessions"("expiresAt", "revokedAt");
CREATE UNIQUE INDEX "site_cms_articles_siteId_slug_key" ON "site_cms_articles"("siteId", "slug");
CREATE INDEX "site_cms_articles_siteId_status_updatedAt_idx" ON "site_cms_articles"("siteId", "status", "updatedAt");
CREATE INDEX "site_cms_articles_publishedAt_idx" ON "site_cms_articles"("publishedAt");
CREATE INDEX "site_cms_audit_logs_siteId_createdAt_idx" ON "site_cms_audit_logs"("siteId", "createdAt");
CREATE INDEX "site_cms_audit_logs_accountId_createdAt_idx" ON "site_cms_audit_logs"("accountId", "createdAt");
CREATE INDEX "site_cms_audit_logs_articleId_createdAt_idx" ON "site_cms_audit_logs"("articleId", "createdAt");

ALTER TABLE "site_cms_accounts" ADD CONSTRAINT "site_cms_accounts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_cms_sessions" ADD CONSTRAINT "site_cms_sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "site_cms_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_cms_articles" ADD CONSTRAINT "site_cms_articles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_cms_articles" ADD CONSTRAINT "site_cms_articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "site_cms_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_cms_articles" ADD CONSTRAINT "site_cms_articles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "site_cms_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "site_cms_audit_logs" ADD CONSTRAINT "site_cms_audit_logs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_cms_audit_logs" ADD CONSTRAINT "site_cms_audit_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "site_cms_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "site_cms_audit_logs" ADD CONSTRAINT "site_cms_audit_logs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "site_cms_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
