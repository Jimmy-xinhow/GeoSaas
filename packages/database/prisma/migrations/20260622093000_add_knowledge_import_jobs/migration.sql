-- CreateTable
CREATE TABLE "knowledge_import_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "extractedChars" INTEGER NOT NULL DEFAULT 0,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "countsTowardQuota" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "errorMessage" TEXT,
    "draftJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_import_jobs_userId_createdAt_idx" ON "knowledge_import_jobs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_import_jobs_siteId_fileHash_createdAt_idx" ON "knowledge_import_jobs"("siteId", "fileHash", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_import_jobs_status_createdAt_idx" ON "knowledge_import_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "knowledge_import_jobs" ADD CONSTRAINT "knowledge_import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_import_jobs" ADD CONSTRAINT "knowledge_import_jobs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
