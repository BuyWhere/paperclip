CREATE TABLE "run_log_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"log_ref" text NOT NULL,
	"seq" integer NOT NULL,
	"content" text NOT NULL,
	"byte_length" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_operation_log_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"log_ref" text NOT NULL,
	"seq" integer NOT NULL,
	"content" text NOT NULL,
	"byte_length" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_log_chunks" ADD CONSTRAINT "run_log_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_operation_log_chunks" ADD CONSTRAINT "workspace_operation_log_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "run_log_chunks_log_ref_seq_uq" ON "run_log_chunks" USING btree ("log_ref","seq");
--> statement-breakpoint
CREATE INDEX "run_log_chunks_company_log_ref_idx" ON "run_log_chunks" USING btree ("company_id","log_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_operation_log_chunks_log_ref_seq_uq" ON "workspace_operation_log_chunks" USING btree ("log_ref","seq");
--> statement-breakpoint
CREATE INDEX "workspace_operation_log_chunks_company_log_ref_idx" ON "workspace_operation_log_chunks" USING btree ("company_id","log_ref");
