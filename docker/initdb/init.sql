-- Init script for local Postgres used in development
-- Creates enrollment_queue table used by online enrollment flow

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS enrollment_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_name text NOT NULL,
  student_id text,
  email text,
  class_id text NOT NULL,
  photo_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  consent_given boolean NOT NULL DEFAULT false,
  consent_text text,
  photo_quality_score double precision,
  landmark_confidence double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  imported boolean NOT NULL DEFAULT false,
  imported_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_enrollment_queue_class_pending ON enrollment_queue (class_id) WHERE status = 'pending';

-- Note: This local Postgres is provided for development convenience only. RLS policies are managed by Supabase in production.
