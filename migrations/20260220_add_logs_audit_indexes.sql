-- Improve audit-log query performance for school-scoped retrieval and entity tracing
CREATE INDEX IF NOT EXISTS idx_logs_school_timestamp
  ON logs ("schoolId", "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_logs_action_timestamp
  ON logs (action, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_logs_entity_lookup
  ON logs ("entityType", "entityId", "timestamp" DESC);
