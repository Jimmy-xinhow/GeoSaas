ALTER TABLE "site_cms_articles"
ADD COLUMN "contentFormat" TEXT NOT NULL DEFAULT 'markdown',
ADD COLUMN "customCss" TEXT;
