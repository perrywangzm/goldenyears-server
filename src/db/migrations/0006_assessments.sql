CREATE TABLE assessment_results (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  user_id TEXT NULL REFERENCES users (id) ON DELETE CASCADE,
  owner_session_id TEXT NULL,
  recommended_care_type TEXT NOT NULL,
  scores JSONB NOT NULL,
  decided_by TEXT NOT NULL CHECK (decided_by IN ('override', 'score')),
  answers JSONB NOT NULL,
  profile JSONB NOT NULL,
  because JSONB NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX assessment_results_user_latest_idx
  ON assessment_results (user_id, is_latest)
  WHERE user_id IS NOT NULL AND is_latest = TRUE;

CREATE INDEX assessment_results_owner_session_latest_idx
  ON assessment_results (owner_session_id, is_latest)
  WHERE user_id IS NULL AND owner_session_id IS NOT NULL AND is_latest = TRUE;
