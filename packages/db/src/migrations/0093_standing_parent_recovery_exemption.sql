ALTER TABLE "issues" ADD COLUMN "exempt_from_successful_run_recovery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_exempt_successful_run_recovery_idx" ON "issues" USING btree ("company_id","exempt_from_successful_run_recovery") WHERE "exempt_from_successful_run_recovery" = true;
