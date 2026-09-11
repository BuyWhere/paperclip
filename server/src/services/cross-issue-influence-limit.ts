import { and, count, eq, or } from "drizzle-orm";
import { activityLog, heartbeatRuns, issues } from "@paperclipai/db";
import { isUuidLike, issueWriteDenialResponse } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
import { HttpError } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { readRunSourceIssueId, stampRunSourceIssueOnContextSnapshot } from "./run-source-issue.js";

export const CROSS_ISSUE_INFLUENCE_LIMIT = 20;
export const CROSS_ISSUE_INFLUENCE_ENFORCE_AT = new Date("2026-08-11T00:00:00.000Z");
const CROSS_ISSUE_INFLUENCE_ACTIVITY = "issue.cross_issue_influence_observed";
const CROSS_ISSUE_INFLUENCE_REJECTED_ACTIVITY = "issue.cross_issue_influence_cap_rejected";

export type CrossIssueInfluenceKind = "comment" | "update" | "interaction_resolution";
export type CrossIssueInfluenceDecision = {
  allowed: boolean;
  mode: "log_only" | "enforce";
  count: number;
  cap: number;
  enforceAt: string;
};

export function crossIssueInfluenceRunContextError() {
  const { body } = issueWriteDenialResponse("cross_issue_influence_run_context_required");
  return new HttpError(403, body.error, body.details);
}

export function evaluateCrossIssueInfluenceLimit(input: { priorCount: number; now?: Date }): CrossIssueInfluenceDecision {
  const now = input.now ?? new Date();
  const mode = now >= CROSS_ISSUE_INFLUENCE_ENFORCE_AT ? "enforce" : "log_only";
  const nextCount = input.priorCount + 1;
  return {
    allowed: mode === "log_only" || nextCount <= CROSS_ISSUE_INFLUENCE_LIMIT,
    mode,
    count: nextCount,
    cap: CROSS_ISSUE_INFLUENCE_LIMIT,
    enforceAt: CROSS_ISSUE_INFLUENCE_ENFORCE_AT.toISOString(),
  };
}

function identifiersMatch(sourceIssueId: string, targetIssueId: string, targetIssueIdentifier?: string | null) {
  if (sourceIssueId === targetIssueId) return true;
  return Boolean(targetIssueIdentifier && sourceIssueId.toUpperCase() === targetIssueIdentifier.toUpperCase());
}

/**
 * Timer heartbeat runs are created without issueId/taskId. After checkout the
 * issue row holds checkoutRunId/executionRunId. Treat that as same-issue
 * attribution so the assignee can PATCH/comment their own checked-out issue.
 */
function isUnboundTimerSnapshot(contextSnapshot: unknown) {
  if (!contextSnapshot || typeof contextSnapshot !== "object" || Array.isArray(contextSnapshot)) {
    return false;
  }
  const record = contextSnapshot as Record<string, unknown>;
  const source = typeof record.source === "string" ? record.source : "";
  const reason = typeof record.reason === "string" ? record.reason : "";
  const wakeSource = typeof record.wakeSource === "string" ? record.wakeSource : "";
  const wakeReason = typeof record.wakeReason === "string" ? record.wakeReason : "";
  return (
    source === "scheduler" ||
    reason === "interval_elapsed" ||
    wakeSource === "timer" ||
    wakeReason === "heartbeat_timer"
  );
}

async function bindTimerRunToCheckedOutIssue(
  tx: DbTransaction,
  input: {
    runId: string;
    companyId: string;
    agentId: string;
    targetIssueId: string;
    targetIssueIdentifier?: string | null;
    contextSnapshot: unknown;
  },
): Promise<string | null> {
  const bound = await tx
    .select({
      id: issues.id,
      identifier: issues.identifier,
      checkoutRunId: issues.checkoutRunId,
      executionRunId: issues.executionRunId,
    })
    .from(issues)
    .where(
      and(
        eq(issues.id, input.targetIssueId),
        eq(issues.companyId, input.companyId),
        eq(issues.assigneeAgentId, input.agentId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!bound) return null;
  if (
    bound.id !== input.targetIssueId &&
    !(input.targetIssueIdentifier && bound.identifier?.toUpperCase() === input.targetIssueIdentifier.toUpperCase())
  ) {
    return null;
  }

  const runOwnsIssue = bound.checkoutRunId === input.runId || bound.executionRunId === input.runId;
  // Allow binding if the run owns the checkout (it's the current execution run for this issue)
  // OR if it's an unbound timer snapshot that can claim this issue
  const liveTimerFallback = !runOwnsIssue && isUnboundTimerSnapshot(input.contextSnapshot);
  if (!runOwnsIssue && !liveTimerFallback) return null;

  // Bind the run to the issue - either because the run owns the checkout, or it's a timer run claiming an issue
  const stamped = stampRunSourceIssueOnContextSnapshot(
    input.contextSnapshot as Record<string, unknown> | null | undefined,
    bound.id,
  );
  await tx
    .update(heartbeatRuns)
    .set({ contextSnapshot: stamped })
    .where(eq(heartbeatRuns.id, input.runId));
  return bound.id;
}

export async function observeCrossIssueInfluence(
  db: Db,
  input: {
    companyId: string;
    runId: string;
    agentId: string;
    responsibleUserId?: string | null;
    targetIssueId: string;
    targetIssueIdentifier?: string | null;
    kind: CrossIssueInfluenceKind;
    now?: Date;
  },
): Promise<CrossIssueInfluenceDecision | null> {
  if (!isUuidLike(input.runId)) throw crossIssueInfluenceRunContextError();

  return db.transaction(async (tx) => {
    const run = await tx
      .select({
        id: heartbeatRuns.id,
        companyId: heartbeatRuns.companyId,
        agentId: heartbeatRuns.agentId,
        contextSnapshot: heartbeatRuns.contextSnapshot,
      })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.id, input.runId),
          eq(heartbeatRuns.companyId, input.companyId),
          eq(heartbeatRuns.agentId, input.agentId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!run || run.companyId !== input.companyId || run.agentId !== input.agentId) {
      throw crossIssueInfluenceRunContextError();
    }

    let sourceIssueId = readRunSourceIssueId(run.contextSnapshot);
    if (!sourceIssueId) {
      sourceIssueId = await bindTimerRunToCheckedOutIssue(tx, {
        runId: input.runId,
        companyId: input.companyId,
        agentId: input.agentId,
        targetIssueId: input.targetIssueId,
        targetIssueIdentifier: input.targetIssueIdentifier,
        contextSnapshot: run.contextSnapshot,
      });
    }
    if (!sourceIssueId) throw crossIssueInfluenceRunContextError();

    if (identifiersMatch(sourceIssueId, input.targetIssueId, input.targetIssueIdentifier)) {
      return null;
    }

    const priorCount = await tx
      .select({ count: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.companyId, input.companyId),
          eq(activityLog.runId, input.runId),
          eq(activityLog.action, CROSS_ISSUE_INFLUENCE_ACTIVITY),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0));

    const decision = evaluateCrossIssueInfluenceLimit({ priorCount, now: input.now });
    await tx.insert(activityLog).values({
      companyId: input.companyId,
      actorType: "agent",
      actorId: input.agentId,
      agentId: input.agentId,
      runId: input.runId,
      action: decision.allowed ? CROSS_ISSUE_INFLUENCE_ACTIVITY : CROSS_ISSUE_INFLUENCE_REJECTED_ACTIVITY,
      entityType: "issue",
      entityId: input.targetIssueId,
      details: {
        kind: input.kind,
        sourceIssueId,
        targetIssueId: input.targetIssueId,
        targetIssueIdentifier: input.targetIssueIdentifier ?? null,
        count: decision.count,
        cap: decision.cap,
        mode: decision.mode,
        enforceAt: decision.enforceAt,
        allowed: decision.allowed,
      },
    });

    const logContext = {
      event: "cross_issue_influence_cap",
      companyId: input.companyId,
      runId: input.runId,
      agentId: input.agentId,
      sourceIssueId,
      targetIssueId: input.targetIssueId,
      kind: input.kind,
      count: decision.count,
      cap: decision.cap,
      mode: decision.mode,
      enforceAt: decision.enforceAt,
      allowed: decision.allowed,
    };
    if (decision.allowed) {
      logger.info(logContext, "cross-issue influence observed");
    } else {
      logger.warn(logContext, "cross-issue influence cap exceeded");
    }
    return decision;
  });
}

export function crossIssueInfluenceLimitError(
  decision: CrossIssueInfluenceDecision,
  context: {
    actorLabel?: string | null;
    assigneeLabel?: string | null;
    issueIdentifier?: string | null;
  } = {},
) {
  const { body } = issueWriteDenialResponse("cross_issue_influence_cap_exceeded", {
    ...context,
    cap: decision.cap,
    count: decision.count,
    enforceAt: decision.enforceAt,
  });
  return {
    error: body.error,
    details: {
      ...body.details,
      cap: decision.cap,
      count: decision.count,
      mode: decision.mode,
      enforceAt: decision.enforceAt,
    },
  };
}
