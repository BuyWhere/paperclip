import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import { logger } from "../middleware/logger.js";
import {
  composeWorkspaceRevision,
  hydrateWorkspaceRevision,
} from "./workspace-revision-store.js";
import { getStorageService } from "../storage/index.js";

export interface HydrationResult {
  hydrated: boolean;
  revisionId: string | null;
  fileCount: number;
  bytes: number;
}

export interface PublishResult {
  published: boolean;
  revisionId: string | null;
  version: number | null;
  conflict: boolean;
}

export async function hydrateWorkspaceForRun(input: {
  db: Db;
  companyId: string;
  issueId: string;
  targetDir: string;
}): Promise<HydrationResult> {
  const { db, companyId, issueId, targetDir } = input;

  const headRow = await db.execute(sql`
    SELECT h.current_revision_id, h.version,
           r.overlay_ref, r.revision_id
    FROM issue_workspace_heads h
    JOIN workspace_revisions r ON r.revision_id = h.current_revision_id
    WHERE h.issue_id = ${issueId}
  `);
  const row = headRow[0] as Record<string, unknown> | undefined;
  if (!row || !row.overlay_ref) {
    return { hydrated: false, revisionId: null, fileCount: 0, bytes: 0 };
  }

  const revisionId = row.revision_id as string;
  const overlayRef = row.overlay_ref as string;

  const storage = getStorageService();
  if (storage.provider === "local_disk") {
    return { hydrated: false, revisionId: null, fileCount: 0, bytes: 0 };
  }

  try {
    const result = await hydrateWorkspaceRevision({
      companyId,
      issueId,
      revisionId,
      overlayRef,
      targetDir,
    });

    logger.info(
      {
        issueId,
        revisionId,
        fileCount: result.fileCount,
        bytes: result.bytes,
      },
      "Hydrated workspace from revision",
    );

    return {
      hydrated: true,
      revisionId,
      fileCount: result.fileCount,
      bytes: result.bytes,
    };
  } catch (error) {
    logger.warn(
      {
        issueId,
        revisionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Workspace hydration failed — proceeding with empty workspace",
    );
    return { hydrated: false, revisionId: null, fileCount: 0, bytes: 0 };
  }
}

export async function publishWorkspaceAfterRun(input: {
  db: Db;
  companyId: string;
  issueId: string;
  runId: string;
  workspaceDir: string;
  parentRevisionId: string | null;
  expectedVersion: number | null;
}): Promise<PublishResult> {
  const { db, companyId, issueId, runId, workspaceDir, parentRevisionId, expectedVersion } = input;

  const storage = getStorageService();
  if (storage.provider === "local_disk") {
    return { published: false, revisionId: null, version: null, conflict: false };
  }

  const revisionId = randomUUID();

  try {
    const manifest = await composeWorkspaceRevision({
      companyId,
      issueId,
      revisionId,
      parentRevisionId,
      createdByRunId: runId,
      workspaceDir,
      generatePatch: true,
    });

    await db.execute(sql`
      INSERT INTO workspace_revisions
        (revision_id, issue_id, parent_revision_id, overlay_ref, patch_ref,
         size_bytes, file_count, created_by_run_id, created_at)
      VALUES
        (${revisionId}, ${issueId}, ${parentRevisionId ?? null},
         ${manifest.overlayRef}, ${manifest.patchRef},
         ${manifest.sizeBytesCompressed}, ${manifest.fileCount},
         ${runId}, now())
    `);

    if (expectedVersion != null) {
      const advResult = await db.execute(sql`
        SELECT advance_workspace_head(
          ${issueId}::uuid,
          ${revisionId}::uuid,
          ${expectedVersion}::int
        ) AS result
      `);
      const advRow = advResult[0] as Record<string, unknown> | undefined;
      let parsed: Record<string, unknown> = {};
      const raw = advRow?.result;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      } else if (raw && typeof raw === "object") {
        parsed = raw as Record<string, unknown>;
      }

      if (!parsed?.ok) {
        logger.warn(
          {
            issueId,
            revisionId,
            expectedVersion,
            actualVersion: parsed?.version ?? null,
          },
          "Workspace head CAS conflict — another run published first",
        );
        return {
          published: true,
          revisionId,
          version: (parsed?.version as number) ?? null,
          conflict: true,
        };
      }

      logger.info(
        {
          issueId,
          revisionId,
          version: parsed.version,
        },
        "Published workspace revision with head advance",
      );

      return {
        published: true,
        revisionId,
        version: parsed.version as number,
        conflict: false,
      };
    } else {
      await db.execute(sql`
        INSERT INTO issue_workspace_heads (issue_id, current_revision_id, version, updated_at)
        VALUES (${issueId}, ${revisionId}, 1, now())
        ON CONFLICT (issue_id) DO UPDATE SET
          current_revision_id = ${revisionId},
          version = issue_workspace_heads.version + 1,
          updated_at = now()
      `);

      logger.info(
        {
          issueId,
          revisionId,
        },
        "Published workspace revision (initial head)",
      );

      return { published: true, revisionId, version: 1, conflict: false };
    }
  } catch (error) {
    logger.warn(
      {
        issueId,
        revisionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Workspace publish failed — run result still preserved",
    );
    return { published: false, revisionId: null, version: null, conflict: false };
  }
}

export async function getWorkspaceHead(input: {
  db: Db;
  issueId: string;
}): Promise<{ revisionId: string | null; version: number | null }> {
  const result = await input.db.execute(sql`
    SELECT current_revision_id, version
    FROM issue_workspace_heads
    WHERE issue_id = ${input.issueId}
  `);
  const row = result[0] as Record<string, unknown> | undefined;
  if (!row) return { revisionId: null, version: null };
  return {
    revisionId: row.current_revision_id as string | null,
    version: row.version as number | null,
  };
}

export async function ensureWorkspaceRevisionTables(db: Db): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'issue_workspace_heads'
    ) AS exists
  `);
  const row = result[0] as Record<string, unknown> | undefined;
  return row?.exists === true || row?.exists === "true";
}
