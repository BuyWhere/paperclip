import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const runLogChunks = pgTable(
  "run_log_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    logRef: text("log_ref").notNull(),
    seq: integer("seq").notNull(),
    content: text("content").notNull(),
    byteLength: integer("byte_length").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    logRefSeqUq: uniqueIndex("run_log_chunks_log_ref_seq_uq").on(table.logRef, table.seq),
    companyLogRefIdx: index("run_log_chunks_company_log_ref_idx").on(table.companyId, table.logRef),
  }),
);

export const workspaceOperationLogChunks = pgTable(
  "workspace_operation_log_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    logRef: text("log_ref").notNull(),
    seq: integer("seq").notNull(),
    content: text("content").notNull(),
    byteLength: integer("byte_length").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    logRefSeqUq: uniqueIndex("workspace_operation_log_chunks_log_ref_seq_uq").on(table.logRef, table.seq),
    companyLogRefIdx: index("workspace_operation_log_chunks_company_log_ref_idx").on(table.companyId, table.logRef),
  }),
);
