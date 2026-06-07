CREATE TABLE IF NOT EXISTS "agent_instruction_files" (
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"relative_path" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_instruction_files_pkey" PRIMARY KEY ("agent_id", "relative_path")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_instruction_files_agent_id_agents_id_fk') THEN
		ALTER TABLE "agent_instruction_files" ADD CONSTRAINT "agent_instruction_files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_instruction_files_company_id_companies_id_fk') THEN
		ALTER TABLE "agent_instruction_files" ADD CONSTRAINT "agent_instruction_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_instruction_files_agent_idx" ON "agent_instruction_files" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_instruction_files_company_idx" ON "agent_instruction_files" USING btree ("company_id");
