/**
 * Copy contract for denied issue writes (open cross-task writes: failure UX).
 *
 * Every remaining wall must say three things:
 *   1. which boundary fired,
 *   2. who can act,
 *   3. the sanctioned path forward.
 */

export const ISSUE_WRITE_DENIAL_CODES = [
  "issue_write_not_visible",
  "issue_write_actor_class_excluded",
  "issue_write_responsible_user_ceiling",
  "issue_write_responsible_user_unavailable",
  "issue_write_assignee_run_lock",
  "cross_issue_influence_cap_exceeded",
  "cross_issue_influence_run_context_required",
  "issue_write_attribution_spoof_rejected",
] as const;

export type IssueWriteDenialCode = (typeof ISSUE_WRITE_DENIAL_CODES)[number];
export type IssueWriteDenialTone = "boundary" | "lock" | "cap" | "attribution";

export interface IssueWriteDenialCopy {
  code: IssueWriteDenialCode;
  status: 403 | 409 | 422 | 429;
  tone: IssueWriteDenialTone;
  boundary: string;
  title: string;
  description: string;
  whoCanAct: string;
  sanctionedPath: string;
}

export interface IssueWriteDenialContext {
  actorLabel?: string | null;
  responsibleUserName?: string | null;
  assigneeLabel?: string | null;
  issueIdentifier?: string | null;
  cap?: number | null;
  count?: number | null;
  enforceAt?: string | null;
}

export function isIssueWriteDenialCode(code: string | null | undefined): code is IssueWriteDenialCode {
  return typeof code === "string" && (ISSUE_WRITE_DENIAL_CODES as readonly string[]).includes(code);
}

function issueLabel(identifier?: string | null) {
  const trimmed = identifier?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "this task";
}

function assigneeLabel(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "the current assignee";
}

function actorLabel(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "this agent";
}

const CHILD_ISSUE_PATH =
  "create a child issue with the request in its description (issue creation is a " +
  "separate, open write path) and let its assignee act";

export function describeIssueWriteDenial(
  code: IssueWriteDenialCode,
  context: IssueWriteDenialContext = {},
): IssueWriteDenialCopy {
  const issue = issueLabel(context.issueIdentifier);
  const actor = actorLabel(context.actorLabel);
  const assignee = assigneeLabel(context.assigneeLabel);
  const responsible = context.responsibleUserName?.trim() || "the responsible user";

  switch (code) {
    case "issue_write_not_visible":
      return {
        code,
        status: 403,
        tone: "boundary",
        boundary: "Issue visibility",
        title: "Task is outside this actor's visibility",
        description:
          `Issue writes are open by default, but only for tasks the actor can already ` +
          `read. ${issue} is not visible to ${actor}, so its comment, update, child, and ` +
          `assignment channels are all closed — the wall is visibility, not the write itself.`,
        whoCanAct: `${assignee}, and any agent or board member the task is visible to.`,
        sanctionedPath: `Ask the board to widen visibility for ${actor}, or ${CHILD_ISSUE_PATH}.`,
      };
    case "issue_write_actor_class_excluded":
      return {
        code,
        status: 403,
        tone: "boundary",
        boundary: "Actor-class boundary",
        title: "This actor class cannot write to tasks",
        description:
          `Default-open issue writes are a standard-trust privilege. Low-trust, ` +
          `skill-test, and task-bridge scopes keep their existing tight walls, so ` +
          `${actor} cannot write to ${issue} no matter who it acts for.`,
        whoCanAct: `A standard-trust agent in this company, or a board member.`,
        sanctionedPath:
          `Report the request upward and let a standard-trust agent make the write — ` +
          `actor-class scope cannot be widened per task.`,
      };
    case "issue_write_responsible_user_ceiling":
      return {
        code,
        status: 403,
        tone: "boundary",
        boundary: "Responsible-user ceiling",
        title: "Responsible user is not authorized for this write",
        description: `The write to ${issue} was refused because ${responsible} is not authorized.`,
        whoCanAct: `${responsible} once authorized, or anyone already permitted to write to ${issue}.`,
        sanctionedPath: `Ask the board to authorize ${responsible}, or ${CHILD_ISSUE_PATH}.`,
      };
    case "issue_write_responsible_user_unavailable":
      return {
        code,
        status: 403,
        tone: "boundary",
        boundary: "Responsible-user availability",
        title: "Responsible user is unavailable",
        description: `The write to ${issue} was refused because ${responsible} is unavailable.`,
        whoCanAct: `A board member, or ${actor} once it has an active responsible user.`,
        sanctionedPath: `Restore an active responsible user, then retry.`,
      };
    case "issue_write_assignee_run_lock":
      return {
        code,
        status: 409,
        tone: "lock",
        boundary: "Run checkout lock",
        title: "Another agent's run owns this task",
        description:
          `${assignee} has ${issue} checked out and a run is live. Checkout and run ` +
          `ownership stay assignee-scoped even though writes are open, so field edits ` +
          `belong to the run that holds the lock until it finishes.`,
        whoCanAct: `${assignee}'s live run, or an agent holding the manage-active-checkouts permission.`,
        sanctionedPath:
          `Comment instead of patching — comments stay open and wake ${assignee} — or ` +
          `wait for the run to release the lock and retry.`,
      };
    case "cross_issue_influence_cap_exceeded": {
      const cap = context.cap ?? 20;
      const attempt = context.count ?? null;
      return {
        code,
        status: 429,
        tone: "cap",
        boundary: `Per-run cross-issue cap of ${cap} writes`,
        title: "This run has spent its cross-issue write budget",
        description:
          `A single heartbeat run may make at most ${cap} cross-issue comments or task ` +
          `updates combined${attempt !== null ? `; this was attempt ${attempt}` : ""}. The cap ` +
          `bounds runaway comment sprays and loops — it is a rate backstop, not a ` +
          `permission decision, so ${actor} is still allowed to write to ${issue}.`,
        whoCanAct: `${actor} on its next heartbeat run, or ${assignee} on ${issue} directly.`,
        sanctionedPath:
          `Consolidate what is left into one comment on your own task, or end the run and ` +
          `continue on the next heartbeat — the budget resets per run.`,
      };
    }
    case "cross_issue_influence_run_context_required":
      return {
        code,
        status: 403,
        tone: "boundary",
        boundary: "Heartbeat run context",
        title: "Cross-issue writes need a run to attribute them to",
        description:
          `Every agent comment and task update is attributed to a heartbeat run so the ` +
          `cross-issue cap can be counted and the audit trail can name who acted for whom. ` +
          `This request arrived without a valid run bound to the target issue, so it could not be contained.`,
        whoCanAct: `${actor}, once the request carries its own run id and that run is bound to the issue.`,
        sanctionedPath:
          `Send \`X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID\`. Timer heartbeats bind on write after ` +
          `checkout (or when you are the live assignee on a scheduler/timer run). If this still ` +
          `403s with the header attached, the control plane is not running the bind-on-write fix.`,
      };
    case "issue_write_attribution_spoof_rejected":
      return {
        code,
        status: 422,
        tone: "attribution",
        boundary: "Server-derived attribution",
        title: "Responsible user cannot be chosen by the caller",
        description:
          `\`onBehalfOfUserId\` is derived from the authenticated actor, never from the ` +
          `request body — an agent cannot pick the human whose authority it rides. The ` +
          `attempt was recorded in the audit log.`,
        whoCanAct: `${actor} itself: the write is allowed, only the chosen attribution is not.`,
        sanctionedPath:
          `Remove \`onBehalfOfUserId\` from the request and retry; the server fills in ` +
          `${responsible} from your run.`,
      };
  }
}

export function issueWriteDenialApiMessage(copy: IssueWriteDenialCopy): string {
  return [
    `${copy.title} (${copy.boundary}).`,
    copy.description,
    `Who can act: ${copy.whoCanAct}`,
    `Try this: ${copy.sanctionedPath}`,
  ].join(" ");
}

export function issueWriteDenialResponse(code: IssueWriteDenialCode, context: IssueWriteDenialContext = {}) {
  const copy = describeIssueWriteDenial(code, context);
  return {
    status: copy.status,
    body: {
      error: issueWriteDenialApiMessage(copy),
      details: {
        code: copy.code,
        boundary: copy.boundary,
        whoCanAct: copy.whoCanAct,
        sanctionedPath: copy.sanctionedPath,
      },
    },
  };
}
