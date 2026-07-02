-- Migration: Add extended columns to goals table (OS-1809)
-- These columns were added to production via direct SQL (OS-1806 hot-fix)
-- to support the Prisma model's Goal model fields.

-- Add nullable columns for extended goal tracking
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "domainId" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "definition" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "checkMethod" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "checkConfig" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "progress" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Create index on userId for goal queries per user
CREATE INDEX IF NOT EXISTS "goals_userId_idx" ON "goals"("userId");

-- Add index on domainId for domain-based filtering
CREATE INDEX IF NOT EXISTS "goals_domainId_idx" ON "goals"("domainId");
