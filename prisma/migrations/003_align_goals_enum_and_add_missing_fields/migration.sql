-- Migration: Align goals enum values and add missing fields (OS-1809)
-- GoalStatus enum values in production: active, planned, cancelled, achieved, paused, completed, archived
-- Goal model must include all prod columns for prisma migrate deploy to be idempotent

-- Step 1: Ensure GoalStatus enum exists with all values (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoalStatus' AND typtype = 'e') THEN
    CREATE TYPE "GoalStatus" AS ENUM ('active', 'planned', 'cancelled', 'achieved', 'paused', 'completed', 'archived');
  ELSE
    -- Add missing enum values if they don't already exist (idempotent in Postgres 10+)
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'planned';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'achieved';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'active';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'paused';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'archived';
  END IF;
END $$;

-- Step 2: Add missing columns to goals table (already exist in prod, idempotent)
-- These columns exist in production from OS-1806 hot-fix
-- Adding them here ensures prisma migrate deploy works

ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "domainId" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "definition" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "checkMethod" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "checkConfig" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "progress" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) WITH TIME ZONE;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) WITH TIME ZONE;

-- Step 3: Create indexes on extended columns (idempotent)
CREATE INDEX IF NOT EXISTS "goals_userId_idx" ON "goals"("userId");
CREATE INDEX IF NOT EXISTS "goals_domainId_idx" ON "goals"("domainId");
