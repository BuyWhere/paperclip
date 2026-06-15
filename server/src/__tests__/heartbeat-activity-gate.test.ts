import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agentRuntimeState,
  agents,
  companies,
  createDb,
  heartbeatRuns,
  issues,
  projects,
  routineRuns,
  routines,
  routineTriggers,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  REFLECTION_SIGNAL_MUTATIONS,
  isReflectionSignalWake,
  maybeFireReflectionRoutine,
  type ReflectionSignal,
} from "../services/heartbeat.ts";
import { instanceSettingsService } from "../services/instance-settings.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres heartbeat activity-gate tests on this host: ${embeddedPostgresSupport.supported ? "" : embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat activity-gate hook", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-activity-gate-");
    db = createDb(tempDb.connectionString);
    // Ensure instance settings row exists for activity-log writes
    await instanceSettingsService(db).getGeneral();
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(heartbeatRuns);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agentRuntimeState);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedFixture(opts?: {
    routineTitle?: string;
    routineStatus?: "active" | "archived" | "paused";
    includeApiTrigger?: boolean;
    triggerEnabled?: boolean;
  }) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const projectId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Mira",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Reflection",
      status: "in_progress",
    });

    const routineId = randomUUID();
    await db.insert(routines).values({
      id: routineId,
      companyId,
      projectId,
      title: opts?.routineTitle ?? "Nightly reflection — Mira",
      description: null,
      assigneeAgentId: agentId,
      priority: "medium",
      status: opts?.routineStatus ?? "active",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
      variables: [],
    });

    if (opts?.includeApiTrigger !== false) {
      const triggerId = randomUUID();
      await db.insert(routineTriggers).values({
        id: triggerId,
        companyId,
        routineId,
        kind: "api",
        label: "Activity-gated reflection fire",
        enabled: opts?.triggerEnabled ?? true,
      });
      return { companyId, agentId, projectId, routineId, triggerId };
    }

    return { companyId, agentId, projectId, routineId, triggerId: null };
  }

  describe("isReflectionSignalWake", () => {
    it("matches assignment + signal-bearing mutations", () => {
      for (const mutation of REFLECTION_SIGNAL_MUTATIONS) {
        expect(
          isReflectionSignalWake({
            source: "assignment",
            payload: { mutation },
          }),
        ).toBe(true);
      }
    });

    it("rejects non-assignment sources even with signal mutations", () => {
      expect(
        isReflectionSignalWake({
          source: "timer",
          payload: { mutation: "commented" },
        }),
      ).toBe(false);
      expect(
        isReflectionSignalWake({
          source: "on_demand",
          payload: { mutation: "assigned" },
        }),
      ).toBe(false);
      expect(
        isReflectionSignalWake({
          source: "automation",
          payload: { mutation: "blocked" },
        }),
      ).toBe(false);
    });

    it("rejects assignment source with non-signal mutations", () => {
      expect(
        isReflectionSignalWake({
          source: "assignment",
          payload: { mutation: "create" },
        }),
      ).toBe(false);
      expect(
        isReflectionSignalWake({
          source: "assignment",
          payload: { mutation: "update" },
        }),
      ).toBe(false);
      expect(
        isReflectionSignalWake({
          source: "assignment",
          payload: { mutation: "comment" },
        }),
      ).toBe(false);
    });

    it("rejects assignment source with missing or empty payload", () => {
      expect(
        isReflectionSignalWake({
          source: "assignment",
          payload: null,
        }),
      ).toBe(false);
      expect(
        isReflectionSignalWake({
          source: "assignment",
          payload: {},
        }),
      ).toBe(false);
    });
  });

  describe("maybeFireReflectionRoutine", () => {
    /**
     * Test stub for `fireRoutine`. Avoids pulling the full heartbeat → routine
     * dispatch graph into these unit tests; an end-to-end test against the
     * real `routineService` lives in `routines-service.test.ts`.
     */
    function makeFireStub(): {
      calls: Array<{ routineId: string; triggerId: string; idempotencyKey: string; signal: ReflectionSignal; issueId: string | null }>;
      fn: (input: {
        routineId: string;
        triggerId: string;
        idempotencyKey: string;
        signal: ReflectionSignal;
        issueId: string | null;
      }) => Promise<{ id: string }>;
    } {
      const calls: Array<{ routineId: string; triggerId: string; idempotencyKey: string; signal: ReflectionSignal; issueId: string | null }> = [];
      return {
        calls,
        fn: async (input) => {
          calls.push(input);
          return { id: randomUUID() };
        },
      };
    }

    it("fires the api trigger and logs the result on a signal-bearing wake", async () => {
      const { companyId, agentId, routineId, triggerId } = await seedFixture();
      const wakeupRequestId = randomUUID();
      const stub = makeFireStub();

      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "commented" satisfies ReflectionSignal,
        issueId: null,
        wakeupRequestId,
        fireRoutine: stub.fn,
      });

      expect(result.outcome).toBe("fired");
      expect(result.routineId).toBe(routineId);
      expect(result.triggerId).toBe(triggerId);
      expect(result.routineRunId).toBeDefined();
      expect(result.idempotencyKey).toBe(`reflection:${wakeupRequestId}`);

      expect(stub.calls).toEqual([
        {
          routineId,
          triggerId,
          idempotencyKey: `reflection:${wakeupRequestId}`,
          signal: "commented",
          issueId: null,
        },
      ]);

      // activity_log should contain a "reflection.activity_gate_fired" entry
      const logs = await db
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.action, "reflection.activity_gate_fired"),
          ),
        );
      expect(logs).toHaveLength(1);
    });

    it("returns a stable idempotencyKey for the same wakeupRequestId", async () => {
      const { companyId, agentId } = await seedFixture();
      const wakeupRequestId = randomUUID();
      const stub = makeFireStub();

      const result1 = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "assigned",
        issueId: null,
        wakeupRequestId,
        fireRoutine: stub.fn,
      });
      const result2 = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "assigned",
        issueId: null,
        wakeupRequestId,
        fireRoutine: stub.fn,
      });

      expect(result1.idempotencyKey).toBe(result2.idempotencyKey);
      expect(result1.idempotencyKey).toBe(`reflection:${wakeupRequestId}`);
      expect(result1.routineRunId).toBeDefined();
      // The stub generates a fresh id per call, but the idempotencyKey is the
      // same — which is what the routine layer uses to coalesce.
      expect(stub.calls).toHaveLength(2);
      expect(stub.calls[0]?.idempotencyKey).toBe(stub.calls[1]?.idempotencyKey);
    });

    it("skips when the agent has no reflection routine", async () => {
      // No routine seed — only company + agent
      const companyId = randomUUID();
      const agentId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "Paperclip",
        issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      });
      await db.insert(agents).values({
        id: agentId,
        companyId,
        name: "Mira",
        role: "engineer",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      });

      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "status_changed",
        issueId: null,
        wakeupRequestId: randomUUID(),
      });

      expect(result.outcome).toBe("skipped_no_routine");

      const runs = await db
        .select()
        .from(routineRuns)
        .where(eq(routineRuns.companyId, companyId));
      expect(runs).toHaveLength(0);
    });

    it("skips when the reflection routine has no enabled api trigger", async () => {
      const { companyId, agentId } = await seedFixture({ includeApiTrigger: false });
      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "blocked",
        issueId: null,
        wakeupRequestId: randomUUID(),
      });

      expect(result.outcome).toBe("skipped_no_api_trigger");
      expect(result.routineId).toBeDefined();
    });

    it("skips when the api trigger exists but is disabled", async () => {
      const { companyId, agentId } = await seedFixture({ triggerEnabled: false });
      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "commented",
        issueId: null,
        wakeupRequestId: randomUUID(),
      });

      expect(result.outcome).toBe("skipped_no_api_trigger");
    });

    it("only matches routines whose title starts with 'Nightly reflection'", async () => {
      const { companyId, agentId } = await seedFixture({
        routineTitle: "Daily summary — Mira",
      });
      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "commented",
        issueId: null,
        wakeupRequestId: randomUUID(),
      });

      expect(result.outcome).toBe("skipped_no_routine");
    });

    it("does not throw when the injected fireRoutine rejects (defensive wrapper)", async () => {
      const { companyId, agentId } = await seedFixture();
      const wakeupRequestId = randomUUID();

      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "commented",
        issueId: null,
        wakeupRequestId,
        fireRoutine: async () => {
          throw new Error("routine dispatch is down");
        },
      });

      expect(result.outcome).toBe("failed");
      expect(result.error).toContain("routine dispatch is down");
      expect(result.idempotencyKey).toBe(`reflection:${wakeupRequestId}`);

      // The "reflection.activity_gate_failed" log should be recorded
      const logs = await db
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.action, "reflection.activity_gate_failed"),
          ),
        );
      expect(logs).toHaveLength(1);
    });

    it("does not throw when the injected fireRoutine returns null", async () => {
      const { companyId, agentId } = await seedFixture();
      const result = await maybeFireReflectionRoutine({
        db,
        companyId,
        agentId,
        signal: "assigned",
        issueId: null,
        wakeupRequestId: randomUUID(),
        fireRoutine: async () => null,
      });

      expect(result.outcome).toBe("skipped_no_api_trigger");
      expect(result.reason).toBe("fire_routine_returned_null");
    });
  });
});
