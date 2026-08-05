import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { asc, eq, sum } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workspaceOperationLogChunks } from "@paperclipai/db/schema";
import { notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type WorkspaceOperationLogStoreType = "local_file" | "postgres";

export interface WorkspaceOperationLogHandle {
  store: WorkspaceOperationLogStoreType;
  logRef: string;
  /** Internal: increments of bytes written by the postgres store. */
  bytesWritten?: number;
  /** Internal: next seq for the postgres store. */
  nextSeq?: number;
}

export interface WorkspaceOperationLogReadOptions {
  offset?: number;
  limitBytes?: number;
}

export interface WorkspaceOperationLogReadResult {
  content: string;
  nextOffset?: number;
}

export interface WorkspaceOperationLogFinalizeSummary {
  bytes: number;
  sha256?: string;
  compressed: boolean;
}

export interface WorkspaceOperationLogStore {
  begin(input: { companyId: string; operationId: string }): Promise<WorkspaceOperationLogHandle>;
  append(
    handle: WorkspaceOperationLogHandle,
    event: { stream: "stdout" | "stderr" | "system"; chunk: string; ts: string },
  ): Promise<void>;
  finalize(handle: WorkspaceOperationLogHandle): Promise<WorkspaceOperationLogFinalizeSummary>;
  read(handle: WorkspaceOperationLogHandle, opts?: WorkspaceOperationLogReadOptions): Promise<WorkspaceOperationLogReadResult>;
}

function safeSegments(...segments: string[]) {
  return segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

function resolveWithin(basePath: string, relativePath: string) {
  const resolved = path.resolve(basePath, relativePath);
  const base = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(base) && resolved !== path.resolve(basePath)) {
    throw new Error("Invalid log path");
  }
  return resolved;
}

function createLocalFileWorkspaceOperationLogStore(basePath: string): WorkspaceOperationLogStore {
  async function ensureDir(relativeDir: string) {
    const dir = resolveWithin(basePath, relativeDir);
    await fs.mkdir(dir, { recursive: true });
  }

  async function readFileRange(filePath: string, offset: number, limitBytes: number): Promise<WorkspaceOperationLogReadResult> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) throw notFound("Workspace operation log not found");

    const start = Math.max(0, Math.min(offset, stat.size));
    const end = Math.max(start, Math.min(start + limitBytes - 1, stat.size - 1));

    if (start > end) {
      return { content: "", nextOffset: start };
    }

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end });
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });

    const content = Buffer.concat(chunks).toString("utf8");
    const nextOffset = end + 1 < stat.size ? end + 1 : undefined;
    return { content, nextOffset };
  }

  async function sha256File(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  return {
    async begin(input) {
      const [companyId] = safeSegments(input.companyId);
      const operationId = safeSegments(input.operationId)[0]!;
      const relDir = companyId;
      const relPath = path.join(relDir, `${operationId}.ndjson`);
      await ensureDir(relDir);

      const absPath = resolveWithin(basePath, relPath);
      await fs.writeFile(absPath, "", "utf8");

      return { store: "local_file", logRef: relPath };
    },

    async append(handle, event) {
      if (handle.store !== "local_file") return;
      const absPath = resolveWithin(basePath, handle.logRef);
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      await fs.appendFile(absPath, `${line}\n`, "utf8");
    },

    async finalize(handle) {
      if (handle.store !== "local_file") {
        return { bytes: 0, compressed: false };
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) throw notFound("Workspace operation log not found");

      const hash = await sha256File(absPath);
      return {
        bytes: stat.size,
        sha256: hash,
        compressed: false,
      };
    },

    async read(handle, opts) {
      if (handle.store !== "local_file") {
        throw notFound("Workspace operation log not found");
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      return readFileRange(absPath, offset, limitBytes);
    },
  };
}

function createPostgresWorkspaceOperationLogStore(db: Db): WorkspaceOperationLogStore {
  return {
    async begin(input) {
      const [companyId] = safeSegments(input.companyId);
      const operationId = safeSegments(input.operationId)[0]!;
      const relPath = path.join(companyId, `${operationId}.ndjson`);
      return { store: "postgres", logRef: relPath, bytesWritten: 0, nextSeq: 1 };
    },

    async append(handle, event) {
      if (handle.store !== "postgres") return;
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      const content = `${line}\n`;
      const byteLength = Buffer.byteLength(content, "utf8");
      const seq = handle.nextSeq ?? 1;
      handle.nextSeq = seq + 1;
      const segments = handle.logRef.split(path.sep);
      const safeCompanyId = segments[0] ?? "";
      await db.insert(workspaceOperationLogChunks).values({
        companyId: safeCompanyId,
        logRef: handle.logRef,
        seq,
        content,
        byteLength,
      });
      handle.bytesWritten = (handle.bytesWritten ?? 0) + byteLength;
    },

    async finalize(handle) {
      if (handle.store !== "postgres") {
        return { bytes: 0, compressed: false };
      }
      const result = await db
        .select({ total: sum(workspaceOperationLogChunks.byteLength) })
        .from(workspaceOperationLogChunks)
        .where(eq(workspaceOperationLogChunks.logRef, handle.logRef));
      const total = Number(result[0]?.total ?? 0);
      return { bytes: total, compressed: false };
    },

    async read(handle, opts) {
      if (handle.store !== "postgres") {
        throw notFound("Workspace operation log not found");
      }
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      const rows = await db
        .select({ content: workspaceOperationLogChunks.content })
        .from(workspaceOperationLogChunks)
        .where(eq(workspaceOperationLogChunks.logRef, handle.logRef))
        .orderBy(asc(workspaceOperationLogChunks.seq));
      const joined = rows.map((r) => r.content).join("");
      const buffer = Buffer.from(joined, "utf8");
      const start = Math.max(0, Math.min(offset, buffer.length));
      const end = Math.max(start, Math.min(start + limitBytes - 1, buffer.length - 1));
      if (start > end) {
        return { content: "", nextOffset: start };
      }
      const content = buffer.subarray(start, end + 1).toString("utf8");
      const nextOffset = end + 1 < buffer.length ? end + 1 : undefined;
      return { content, nextOffset };
    },
  };
}

let cachedStore: WorkspaceOperationLogStore | null = null;

export function getWorkspaceOperationLogStore(db?: Db) {
  if (cachedStore) return cachedStore;
  const backend = (process.env.PAPERCLIP_WORKSPACE_OPERATION_LOG_STORE ?? "postgres").toLowerCase();
  if (backend === "postgres") {
    if (!db) {
      throw new Error(
        "PAPERCLIP_WORKSPACE_OPERATION_LOG_STORE=postgres requires a Db handle; pass db to getWorkspaceOperationLogStore(db).",
      );
    }
    cachedStore = createPostgresWorkspaceOperationLogStore(db);
  } else {
    const basePath = process.env.WORKSPACE_OPERATION_LOG_BASE_PATH
      ?? path.resolve(resolvePaperclipInstanceRoot(), "data", "workspace-operation-logs");
    cachedStore = createLocalFileWorkspaceOperationLogStore(basePath);
  }
  return cachedStore;
}

/** Reset the cached store (for tests). */
export function _resetWorkspaceOperationLogStoreForTests(): void {
  cachedStore = null;
}
