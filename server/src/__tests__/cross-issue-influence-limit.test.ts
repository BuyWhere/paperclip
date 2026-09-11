import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { activityLog, agents, companies, createDb, heartbeatRuns, issues } from "@paperclipai/db";
import { evaluateCrossIssueInfluenceLimit, observeCrossIssueInfluence } from "../services/cross-issue-influence-limit.ts";
import {
  readRunSourceIssueId,
  stampRunSourceIssueOnContextSnapshot,
} from "../services/run-source-issue.ts";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

describe("evaluateCrossIssueInfluenceLimit", () => {
  it("enforces after the cap once the rollout date has passed", () => {
    const decision = evaluateCrossIssueInfluenceLimit({
      priorCount: 20,
      now: new Date("2026-09-07T00:00:00.000Z"),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.mode).toBe("enforce");
    expect(decision.count).toBe(21);
  });

  it("allows writes under the cap", () => {
    const decision = evaluateCrossIssueInfluenceLimit({
      priorCount: 0,
      now: new Date("2026-09-07T00:00:00.000Z"),
    });
    expect(decision.allowed).toBe(true);
    expect(decision.count).toBe(1);
  });
});

describe("timer heartbeat run source issue", () => {
  it("treats a stamped checkout as same-issue attribution", () => {
    const issueId = "4e5aae91-5a81-4ab6-996e-9747916379e1";
    const snapshot = stampRunSourceIssueOnContextSnapshot(
      { wakeSource: "timer", wakeReason: "heartbeat_timer" },
      issueId,
    );
    expect(readRunSourceIssueId(snapshot)).toBe(issueId);
  });
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres cross-issue influence tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("observeCrossIssueInfluence timer bind-on-write", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-cross-issue-influence-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedAgentIssue(opts: {
    checkoutRunId?: string | null;
    runStatus?: string;
    invocationSource?: string;
    snapshot?: Record<string, unknown>;
  }) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Alex",
      role: "engineer",
      status: "running",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: opts.invocationSource ?? "timer",
      status: opts.runStatus ?? "running",
      contextSnapshot: opts.snapshot ?? {
        source: "scheduler",
        reason: "interval_elapsed",
      },
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Timer heartbeat write",
      status: "in_progress",
      priority: "high",
      identifier: "OS-6606",
      assigneeAgentId: agentId,
      checkoutRunId: opts.checkoutRunId === undefined ? runId : opts.checkoutRunId,
    });
    return { companyId, agentId, runId, issueId };
  }

  it("allows a timer run to PATCH/comment the issue it has checked out", async () => {
    await db.delete(activityLog); // Clean up from previous tests
    const seeded = await seedAgentIssue({});
    const decision = await observeCrossIssueInfluence(db, {
      companyId: seeded.companyId,
      runId: seeded.runId,
      agentId: seeded.agentId,
      targetIssueId: seeded.issueId,
      targetIssueIdentifier: "OS-6606",
      kind: "comment",
    });
    expect(decision).toBeNull();

    const run = await db
      .select({ contextSnapshot: heartbeatRuns.contextSnapshot })
      .from(heartbeatRuns)
      .then((rows) => rows[0]);
    expect(readRunSourceIssueId(run?.contextSnapshot)).toBe(seeded.issueId);
  });

  it("allows a live timer run that is the assignee even if checkoutRunId was not stamped", async () => {
    const seeded = await seedAgentIssue({ checkoutRunId: null });
    const decision = await observeCrossIssueInfluence(db, {
      companyId: seeded.companyId,
      runId: seeded.runId,
      agentId: seeded.agentId,
      targetIssueId: seeded.issueId,
      kind: "update",
    });
    expect(decision).toBeNull();
  });

  it("still requires run context when the run is not a live timer and does not own checkout", async () => {
    const seeded = await seedAgentIssue({
      checkoutRunId: null,
      runStatus: "succeeded",
      invocationSource: "on_demand",
      snapshot: { source: "assignment" },
    });
    await expect(
      observeCrossIssueInfluence(db, {
        companyId: seeded.companyId,
        runId: seeded.runId,
        agentId: seeded.agentId,
        targetIssueId: seeded.issueId,
        kind: "comment",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows an assignment-wakeup run to PATCH/comment the issue it has checked out", async () => {
    const seeded = await seedAgentIssue({
      snapshot: { source: "issue.create" },
    });
    const decision = await observeCrossIssueInfluence(db, {
      companyId: seeded.companyId,
      runId: seeded.runId,
      agentId: seeded.agentId,
      targetIssueId: seeded.issueId,
      targetIssueIdentifier: "OS-6606",
      kind: "update",
    });
    expect(decision).toBeNull();

    const run = await db
      .select({ contextSnapshot: heartbeatRuns.contextSnapshot })
      .from(heartbeatRuns)
      .then((rows) => rows[0]);
    expect(readRunSourceIssueId(run?.contextSnapshot)).toBe(seeded.issueId);
  });
});
