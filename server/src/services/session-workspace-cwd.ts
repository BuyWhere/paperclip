import path from "node:path";

import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";

const SESSION_CWD_SYSTEM_ROOTS = new Set([
  "/",
  "/tmp",
  "/var",
  "/var/tmp",
  "/var/run",
  "/usr",
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/private",
  "/private/tmp",
]);

// Paperclip managed-instance path marker. The agent home + project workspace
// dirs live under resolvePaperclipHomeDir()/resolvePaperclipInstanceRoot().
// When a stored `cwd` for a project workspace points into that tree (or is
// missing entirely), heartbeat should treat the workspace as "managed" and
// be willing to repair the path.
const PAPERCLIP_MANAGED_INSTANCE_PATH_PREFIXES: readonly string[] = [
  process.env.PAPERCLIP_HOME_DIR?.trim() || "",
  process.env.PAPERCLIP_INSTANCE_ROOT?.trim() || "",
].filter((value) => value.length > 0);

export function isUnsafeSessionWorkspaceCwd(cwd: string | null | undefined): boolean {
  const value = typeof cwd === "string" && cwd.trim().length > 0 ? cwd.trim() : null;
  if (!value) return false;
  const normalized = path.normalize(value.replace(/\/+$/, "") || "/");
  return SESSION_CWD_SYSTEM_ROOTS.has(normalized);
}

/**
 * Returns true when `cwd` resolves to the agent's default home directory for
 * `agentId` (the same path returned by `resolveDefaultAgentWorkspaceDir`).
 * Used by heartbeat to detect when a stored session cwd is the fallback agent
 * home (the runtime treats this case as "no override cwd") and to short-circuit
 * further workspace reconciliation.
 */
export function isFallbackAgentWorkspaceCwd(
  cwd: string | null | undefined,
  agentId: string,
): boolean {
  if (typeof cwd !== "string" || cwd.trim().length === 0) return false;
  const fallback = resolveDefaultAgentWorkspaceDir(agentId);
  return path.resolve(cwd) === path.resolve(fallback);
}

/**
 * Returns true when `cwd` is a path that the Paperclip runtime manages itself
 * (e.g. an agent home or a managed project workspace under the instance root).
 * Heartbeat uses this to decide whether a missing or stale `cwd` should be
 * repaired by re-materializing the managed workspace rather than recreated
 * from scratch.
 */
export function isPaperclipManagedInstancePath(cwd: string | null | undefined): boolean {
  if (typeof cwd !== "string" || cwd.trim().length === 0) return false;
  const resolved = path.resolve(cwd);
  for (const prefix of PAPERCLIP_MANAGED_INSTANCE_PATH_PREFIXES) {
    if (!prefix) continue;
    if (resolved === path.resolve(prefix) || resolved.startsWith(`${path.resolve(prefix)}${path.sep}`)) {
      return true;
    }
  }
  // Always treat the agent home dir as a managed path: it's created on demand
  // and the runtime owns its lifecycle.
  return false;
}
