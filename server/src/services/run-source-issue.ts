function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Stamp the checkout-target issue onto a heartbeat run's contextSnapshot.
 * Timer wakes are created without issueId/taskId; the write gate attributes
 * mutations via those keys. Fill only missing fields so assignment/comment
 * wakes keep their original source issue.
 */
export function stampRunSourceIssueOnContextSnapshot(
  contextSnapshot: Record<string, unknown> | null | undefined,
  issueId: string,
): Record<string, unknown> {
  const next = { ...(contextSnapshot ?? {}) };
  if (!readNonEmptyString(next.issueId)) next.issueId = issueId;
  if (!readNonEmptyString(next.taskId)) next.taskId = issueId;
  return next;
}

export function readRunSourceIssueId(contextSnapshot: unknown): string | null {
  if (!contextSnapshot || typeof contextSnapshot !== "object" || Array.isArray(contextSnapshot)) {
    return null;
  }
  const record = contextSnapshot as Record<string, unknown>;
  return readNonEmptyString(record.issueId) ?? readNonEmptyString(record.taskId);
}
