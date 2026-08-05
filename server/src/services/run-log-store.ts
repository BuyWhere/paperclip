import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, asc, eq, sql, sum } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { runLogChunks } from "@paperclipai/db/schema";
import { notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type RunLogStoreType = "local_file" | "postgres";

export interface RunLogHandle {
  store: RunLogStoreType;
  logRef: string;
  /** Internal: increments of bytes written by the postgres store, for finalize summaries. */
  bytesWritten?: number;
  /** Internal: next seq for the postgres store. */
  nextSeq?: number;
}

export interface RunLogReadOptions {
  offset?: number;
  limitBytes?: number;
}

export interface RunLogReadResult {
  content: string;
  nextOffset?: number;
}

export interface RunLogFinalizeSummary {
  bytes: number;
  sha256?: string;
  compressed: boolean;
}

export interface RunLogStore {
  begin(input: { companyId: string; agentId: string; runId: string }): Promise<RunLogHandle>;
  append(
    handle: RunLogHandle,
    event: { stream: "stdout" | "stderr" | "system"; chunk: string; ts: string },
  ): Promise<number>;
  finalize(handle: RunLogHandle): Promise<RunLogFinalizeSummary>;
  read(handle: RunLogHandle, opts?: RunLogReadOptions): Promise<RunLogReadResult>;
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

function createLocalFileRunLogStore(basePath: string): RunLogStore {
  async function ensureDir(relativeDir: string) {
    const dir = resolveWithin(basePath, relativeDir);
    await fs.mkdir(dir, { recursive: true });
  }

  async function readFileRange(filePath: string, offset: number, limitBytes: number): Promise<RunLogReadResult> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) throw notFound("Run log not found");

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
      const [companyId, agentId] = safeSegments(input.companyId, input.agentId);
      const runId = safeSegments(input.runId)[0]!;
      const relDir = path.join(companyId, agentId);
      const relPath = path.join(relDir, `${runId}.ndjson`);
      await ensureDir(relDir);

      const absPath = resolveWithin(basePath, relPath);
      await fs.writeFile(absPath, "", "utf8");

      return { store: "local_file", logRef: relPath };
    },

    async append(handle, event) {
      if (handle.store !== "local_file") return 0;
      const absPath = resolveWithin(basePath, handle.logRef);
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      const persisted = `${line}\n`;
      await fs.appendFile(absPath, persisted, "utf8");
      return Buffer.byteLength(persisted, "utf8");
    },

    async finalize(handle) {
      if (handle.store !== "local_file") {
        return { bytes: 0, compressed: false };
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) throw notFound("Run log not found");

      const hash = await sha256File(absPath);
      return {
        bytes: stat.size,
        sha256: hash,
        compressed: false,
      };
    },

    async read(handle, opts) {
      if (handle.store !== "local_file") {
        throw notFound("Run log not found");
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      return readFileRange(absPath, offset, limitBytes);
    },
  };
}

function createPostgresRunLogStore(db: Db): RunLogStore {
  return {
    async begin(input) {
      const [companyId, agentId] = safeSegments(input.companyId, input.agentId);
      const runId = safeSegments(input.runId)[0]!;
      const relDir = path.join(companyId, agentId);
      const relPath = path.join(relDir, `${runId}.ndjson`);
      // Initial chunk seq=1 is reserved for the first append; we do not write
      // any rows in begin() so that empty runs leave no chunks behind.
      return { store: "postgres", logRef: relPath, bytesWritten: 0, nextSeq: 1 };
    },

    async append(handle, event) {
      if (handle.store !== "postgres") return 0;
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      const persisted = `${line}\n`;
      const content = persisted;
      const byteLength = Buffer.byteLength(content, "utf8");
      const seq = handle.nextSeq ?? 1;
      handle.nextSeq = seq + 1;
      // The local_file store used a path like "{company}/{agent}/{runId}.ndjson";
      // we replicate that layout in Postgres `log_ref` so old references keep
      // resolving. We also need companyId for the foreign key; recover it from
      // the path.
      const segments = handle.logRef.split(path.sep);
      const safeCompanyId = segments[0] ?? "";
      await db.insert(runLogChunks).values({
        companyId: safeCompanyId,
        logRef: handle.logRef,
        seq,
        content,
        byteLength,
      });
      handle.bytesWritten = (handle.bytesWritten ?? 0) + byteLength;
      return byteLength;
    },

    async finalize(handle) {
      if (handle.store !== "postgres") {
        return { bytes: 0, compressed: false };
      }
      const result = await db
        .select({ total: sum(runLogChunks.byteLength) })
        .from(runLogChunks)
        .where(eq(runLogChunks.logRef, handle.logRef));
      const total = Number(result[0]?.total ?? 0);
      return { bytes: total, compressed: false };
    },

    async read(handle, opts) {
      if (handle.store !== "postgres") {
        throw notFound("Run log not found");
      }
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      const rows = await db
        .select({ content: runLogChunks.content, byteLength: runLogChunks.byteLength, seq: runLogChunks.seq })
        .from(runLogChunks)
        .where(eq(runLogChunks.logRef, handle.logRef))
        .orderBy(asc(runLogChunks.seq));
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

let cachedStore: RunLogStore | null = null;

export function getRunLogStore(db?: Db) {
  if (cachedStore) return cachedStore;
  const backend = (process.env.PAPERCLIP_RUN_LOG_STORE ?? "postgres").toLowerCase();
  if (backend === "postgres") {
    if (!db) {
      throw new Error(
        "PAPERCLIP_RUN_LOG_STORE=postgres requires a Db handle; pass db to getRunLogStore(db).",
      );
    }
    cachedStore = createPostgresRunLogStore(db);
  } else {
    const basePath = process.env.RUN_LOG_BASE_PATH ?? path.resolve(resolvePaperclipInstanceRoot(), "data", "run-logs");
    cachedStore = createLocalFileRunLogStore(basePath);
  }
  return cachedStore;
}

/** Reset the cached store (for tests). */
export function _resetRunLogStoreForTests(): void {
  cachedStore = null;
}
