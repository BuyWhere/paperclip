import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  instanceSettings,
  issues,
  issueComments,
  costEvents,
  heartbeatRuns,
  heartbeatRunEvents,
  agentConfigRevisions,
  agentApiKeys,
  agentRuntimeState,
  agentTaskSessions,
  agentWakeupRequests,
  issueExecutionDecisions,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { agentService } from "../services/agents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function issuePrefix(id: string) {
  return `T${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres agent-update-activity tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("agentService.update activity logging", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-agent-update-activity-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.execute(sql`drop trigger if exists agent_test_model_change_guard on ${agents}`);
    await db.execute(sql`drop function if exists agent_test_model_change_guard()`);
    await db.delete(agentConfigRevisions);
    await db.delete(activityLog);
    await db.delete(agentApiKeys);
    await db.delete(agentRuntimeState);
    await db.delete(agentTaskSessions);
    await db.delete(agentWakeupRequests);
    await db.delete(agentConfigRevisions);
    await db.delete(costEvents);
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(issueExecutionDecisions);
    await db.delete(issueComments);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
    await db.delete(instanceSettings);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: issuePrefix(companyId),
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Builder",
      role: "engineer",
      status: "idle",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    return { companyId, agentId };
  }

  it("writes an agent.updated activity row when updateAgent is called with an actor", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const userId = randomUUID();
    const agents = agentService(db);

    const updated = await agents.update(
      agentId,
      { adapterConfig: { command: "pnpm new" } },
      {
        actor: {
          actorType: "user",
          actorId: userId,
          agentId: null,
          runId: null,
        },
      },
    );

    expect(updated).toBeTruthy();
    const rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, agentId));
    const agentUpdated = rows.filter((row) => row.action === "agent.updated");
    expect(agentUpdated).toHaveLength(1);
    expect(agentUpdated[0]).toMatchObject({
      companyId,
      actorType: "user",
      actorId: userId,
      entityType: "agent",
      entityId: agentId,
    });
    const details = (agentUpdated[0].details ?? {}) as Record<string, unknown>;
    expect(details.changedTopLevelKeys).toEqual(["adapterConfig"]);
    expect(details.changedAdapterConfigKeys).toEqual(["command"]);
  });

  it("skips the activity row when logActivity: false is passed", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const agents = agentService(db);

    await agents.update(
      agentId,
      { adapterConfig: { command: "pnpm skip" } },
      {
        actor: {
          actorType: "user",
          actorId: randomUUID(),
          agentId: null,
          runId: null,
        },
        logActivity: false,
      },
    );

    const rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, agentId));
    const agentUpdated = rows.filter((row) => row.action === "agent.updated");
    expect(agentUpdated).toHaveLength(0);
  });

  it("uses the override action/details when logActivity is an object", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const agents = agentService(db);

    await agents.update(
      agentId,
      { adapterConfig: { instructionsFilePath: "/tmp/AGENTS.md" } },
      {
        actor: {
          actorType: "user",
          actorId: randomUUID(),
          agentId: null,
          runId: null,
        },
        logActivity: {
          action: "agent.instructions_path_updated",
          details: { path: "/tmp/AGENTS.md" },
        },
      },
    );

    const rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, agentId));
    const customAction = rows.filter((row) => row.action === "agent.instructions_path_updated");
    expect(customAction).toHaveLength(1);
    expect((customAction[0].details ?? {}) as Record<string, unknown>).toEqual({
      path: "/tmp/AGENTS.md",
    });
    // No "agent.updated" row should be emitted when an override action is set.
    const agentUpdated = rows.filter((row) => row.action === "agent.updated");
    expect(agentUpdated).toHaveLength(0);
  });

  it("derives actor from recordRevision when actor option is omitted", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const userId = randomUUID();
    const agents = agentService(db);

    await agents.update(
      agentId,
      { title: "Lead" },
      {
        recordRevision: {
          createdByUserId: userId,
          source: "patch",
        },
      },
    );

    const rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, agentId));
    const agentUpdated = rows.filter((row) => row.action === "agent.updated");
    expect(agentUpdated).toHaveLength(1);
    expect(agentUpdated[0]).toMatchObject({
      actorType: "user",
      actorId: userId,
    });
  });

  it("surfaces model-change guard failures as 422s", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const agentsSvc = agentService(db);

    await db.update(agents).set({
      adapterConfig: {
        model: "gpt-5.4",
        cheapModel: "GPT-5.3-Codex-Spark",
      },
    }).where(eq(agents.id, agentId));

    await db.execute(sql`
      create function agent_test_model_change_guard()
      returns trigger as $$
      begin
        if coalesce(current_setting('paperclip.allow_model_change', true), '') <> 'true'
           and coalesce(old.adapter_config->>'cheapModel', '') is distinct from coalesce(new.adapter_config->>'cheapModel', '') then
          raise exception 'MODEL_CHANGE_BLOCKED: Cannot change agent "%" cheapModel from "%" to "%". Set paperclip.allow_model_change=true to override.',
            old.name,
            coalesce(old.adapter_config->>'cheapModel', ''),
            coalesce(new.adapter_config->>'cheapModel', '');
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    await db.execute(sql`
      create trigger agent_test_model_change_guard
      before update on ${agents}
      for each row execute function agent_test_model_change_guard();
    `);

    await expect(agentsSvc.update(agentId, {
      adapterConfig: {
        model: "gpt-5.4",
      },
    })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('Cannot change agent "Builder" cheapModel'),
      details: { code: "model_change_blocked" },
    });
  });

  it("uses the scoped model-change bypass for legacy cheapModel cleanup", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const agentsSvc = agentService(db);

    await db.update(agents).set({
      adapterConfig: {
        model: "gpt-5.4",
        cheapModel: "GPT-5.3-Codex-Spark",
      },
    }).where(eq(agents.id, agentId));

    await db.execute(sql`
      create function agent_test_model_change_guard()
      returns trigger as $$
      begin
        if coalesce(current_setting('paperclip.allow_model_change', true), '') <> 'true'
           and coalesce(old.adapter_config->>'cheapModel', '') is distinct from coalesce(new.adapter_config->>'cheapModel', '') then
          raise exception 'MODEL_CHANGE_BLOCKED: Cannot change agent "%" cheapModel from "%" to "%". Set paperclip.allow_model_change=true to override.',
            old.name,
            coalesce(old.adapter_config->>'cheapModel', ''),
            coalesce(new.adapter_config->>'cheapModel', '');
        end if;
        return new;
      end;
      $$ language plpgsql;
    `);
    await db.execute(sql`
      create trigger agent_test_model_change_guard
      before update on ${agents}
      for each row execute function agent_test_model_change_guard();
    `);

    const updated = await agentsSvc.update(
      agentId,
      {
        adapterConfig: {
          model: "gpt-5.4",
        },
      },
      { allowLegacyCheapModelCleanup: true },
    );

    expect(updated?.adapterConfig).toEqual({
      model: "gpt-5.4",
    });
  });
});
