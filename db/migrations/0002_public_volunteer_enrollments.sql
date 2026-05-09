CREATE TABLE IF NOT EXISTS volunteer_enrollments (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  enrollment_code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  node_id UUID REFERENCES volunteer_nodes(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'public_signup'
);

CREATE INDEX IF NOT EXISTS volunteer_enrollments_email_idx ON volunteer_enrollments(email);
CREATE INDEX IF NOT EXISTS volunteer_enrollments_status_created_idx ON volunteer_enrollments(status, created_at DESC);
