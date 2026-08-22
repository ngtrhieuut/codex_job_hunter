-- Phase 0/1 persistence hardening. All statements are idempotent so the
-- lightweight migration runner can safely re-run the complete directory.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS normalized_record jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'P2',
  ADD COLUMN IF NOT EXISTS score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_value_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_revenue_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk text NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS next_action text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_action_owner text NOT NULL DEFAULT 'codex',
  ADD COLUMN IF NOT EXISTS human_gate text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS blocked_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS branch_or_pr text,
  ADD COLUMN IF NOT EXISTS last_checkpoint_commit text;

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS decision_id uuid;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE qa_runs
  ADD COLUMN IF NOT EXISTS reviewer text NOT NULL DEFAULT 'QA Agent',
  ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_message_draft text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS final_approval_status text NOT NULL DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS job_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  question text NOT NULL,
  recommendation text NOT NULL DEFAULT '',
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_decision text NOT NULL DEFAULT 'PENDING',
  owner_decision_note text,
  decided_by text NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  impact text
);
CREATE INDEX IF NOT EXISTS job_decisions_job_idx ON job_decisions (job_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS job_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  summary text NOT NULL,
  evidence text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_activities_job_idx ON job_activities (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  severity text NOT NULL DEFAULT 'BLOCKING',
  details text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS reconciliation_conflicts_open_idx
  ON reconciliation_conflicts (resolved_at, detected_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS economic_outcomes_job_unique
  ON economic_outcomes (job_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_decision_id_fk'
  ) THEN
    ALTER TABLE approvals
      ADD CONSTRAINT approvals_decision_id_fk
      FOREIGN KEY (decision_id) REFERENCES job_decisions(id) ON DELETE SET NULL;
  END IF;
END $$;
