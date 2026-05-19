CREATE TABLE IF NOT EXISTS workspace_revisions (
  revision_id UUID NOT NULL PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  parent_revision_id UUID,
  base_ref TEXT,
  overlay_ref TEXT NOT NULL,
  patch_ref TEXT,
  size_bytes_compressed INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_by_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_revisions_issue_id_created_at
  ON workspace_revisions(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_revisions_created_by_run_id
  ON workspace_revisions(created_by_run_id)
  WHERE created_by_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS issue_workspace_heads (
  issue_id UUID NOT NULL PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
  current_revision_id UUID NOT NULL REFERENCES workspace_revisions(revision_id),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_artifacts (
  artifact_id UUID NOT NULL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL,
  kind TEXT NOT NULL,
  object_ref TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_issue_id ON run_artifacts(issue_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_issue_kind ON run_artifacts(issue_id, kind);

CREATE TABLE IF NOT EXISTS run_logs (
  run_id UUID NOT NULL PRIMARY KEY REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
  stdout_ref TEXT,
  stderr_ref TEXT,
  summary_ref TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION advance_workspace_head(
  p_issue_id UUID,
  p_new_revision_id UUID,
  p_expected_version INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_current_version INTEGER;
  v_new_version INTEGER;
BEGIN
  SELECT version INTO v_current_version
    FROM issue_workspace_heads
    WHERE issue_id = p_issue_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO issue_workspace_heads (issue_id, current_revision_id, version, updated_at)
    VALUES (p_issue_id, p_new_revision_id, 1, NOW())
    ON CONFLICT (issue_id) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'version', 1);
  END IF;

  IF v_current_version != p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'version', v_current_version,
      'error', 'version_mismatch'
    );
  END IF;

  v_new_version := v_current_version + 1;

  UPDATE issue_workspace_heads
    SET current_revision_id = p_new_revision_id,
        version = v_new_version,
        updated_at = NOW()
    WHERE issue_id = p_issue_id;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$ LANGUAGE plpgsql;
