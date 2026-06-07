import { pgTable, uuid, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const agentInstructionFiles = pgTable(
  "agent_instruction_files",
  {
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    relativePath: text("relative_path").notNull(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.agentId, table.relativePath],
      name: "agent_instruction_files_pkey",
    }),
    agentIdx: index("agent_instruction_files_agent_idx").on(table.agentId),
    companyIdx: index("agent_instruction_files_company_idx").on(table.companyId),
  }),
);
