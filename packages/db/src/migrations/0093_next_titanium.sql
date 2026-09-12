ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "disposition" text;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "next_step" text;
