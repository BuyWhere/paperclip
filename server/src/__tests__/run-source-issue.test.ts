import { describe, expect, it } from "vitest";
import {
  readRunSourceIssueId,
  stampRunSourceIssueOnContextSnapshot,
} from "../services/run-source-issue.ts";

describe("stampRunSourceIssueOnContextSnapshot", () => {
  it("fills issueId and taskId on timer snapshots that have neither", () => {
    const stamped = stampRunSourceIssueOnContextSnapshot(
      { source: "scheduler", reason: "interval_elapsed", wakeSource: "timer" },
      "issue-heartbeat",
    );
    expect(stamped.issueId).toBe("issue-heartbeat");
    expect(stamped.taskId).toBe("issue-heartbeat");
    expect(readRunSourceIssueId(stamped)).toBe("issue-heartbeat");
  });

  it("does not overwrite an existing assignment source issue", () => {
    const stamped = stampRunSourceIssueOnContextSnapshot(
      { issueId: "assigned-issue", taskId: "assigned-issue", wakeSource: "assignment" },
      "other-issue",
    );
    expect(stamped.issueId).toBe("assigned-issue");
    expect(stamped.taskId).toBe("assigned-issue");
  });
});
