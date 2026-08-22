CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text,
  source_url text,
  title text NOT NULL,
  original_description text NOT NULL DEFAULT '',
  normalized_summary text,
  category text,
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  inferred_acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_min numeric,
  budget_max numeric,
  currency text,
  explicit_deadline timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DISCOVERED',
  hard_filter_reason text,
  duplicate_of uuid REFERENCES opportunities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_source_external_id_unique
  ON opportunities (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities (status);
CREATE INDEX IF NOT EXISTS opportunities_category_idx ON opportunities (category);
CREATE INDEX IF NOT EXISTS opportunities_discovered_at_idx ON opportunities (discovered_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  scoring_version text NOT NULL,
  technical_fit numeric NOT NULL,
  completion_probability numeric NOT NULL,
  scope_clarity numeric NOT NULL,
  payment_quality numeric NOT NULL,
  repeatability numeric NOT NULL,
  client_quality numeric NOT NULL,
  verification_quality numeric NOT NULL,
  implementation_effort numeric NOT NULL,
  human_attention numeric NOT NULL,
  communication_burden numeric NOT NULL,
  revision_risk numeric NOT NULL,
  platform_risk numeric NOT NULL,
  security_risk numeric NOT NULL,
  scope_creep_risk numeric NOT NULL,
  scam_risk numeric NOT NULL,
  overall_score numeric NOT NULL,
  estimated_ai_minutes numeric,
  estimated_human_minutes numeric,
  estimated_tokens numeric,
  win_probability numeric,
  expected_net_revenue numeric,
  expected_revenue_per_1m_tokens numeric,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_scores_opportunity_idx ON opportunity_scores (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_scores_overall_idx ON opportunity_scores (overall_score DESC);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  version integer NOT NULL,
  opening text NOT NULL DEFAULT '',
  requirement_interpretation text NOT NULL DEFAULT '',
  implementation_plan text NOT NULL DEFAULT '',
  proof_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_bid numeric,
  minimum_bid numeric,
  currency text,
  timeline_recommendation text,
  scope_included jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, version)
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  job_id uuid,
  approval_type text NOT NULL,
  requested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL DEFAULT 'PENDING',
  decision_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS approvals_pending_idx ON approvals (decision, requested_at DESC);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES proposals(id),
  submitted_at timestamptz,
  submitted_via text NOT NULL DEFAULT 'MANUAL',
  actual_bid numeric,
  currency text,
  status text NOT NULL DEFAULT 'PREPARED',
  external_reference text,
  notes text
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id),
  job_code text NOT NULL UNIQUE,
  title text NOT NULL,
  agreed_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  agreed_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  agreed_deadline timestamptz,
  status text NOT NULL DEFAULT 'PLANNING',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);

CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  verification_method text,
  status text NOT NULL DEFAULT 'TODO',
  evidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  agent_role text,
  status text NOT NULL DEFAULT 'TODO',
  estimate_minutes numeric,
  actual_minutes numeric,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  requested_change text NOT NULL,
  effort_delta_minutes numeric,
  price_delta_recommendation numeric,
  deadline_delta text,
  risk_delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  criteria_result jsonb NOT NULL DEFAULT '[]'::jsonb,
  tests_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  security_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdict text NOT NULL,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, run_number)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  summary text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  tests_performed jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (job_id, version)
);

CREATE TABLE IF NOT EXISTS economic_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  gross_revenue numeric NOT NULL DEFAULT 0,
  platform_fees numeric NOT NULL DEFAULT 0,
  external_costs numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  token_count bigint,
  estimated_ai_minutes numeric,
  actual_human_minutes numeric,
  revisions_count integer NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'UNPAID',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS state_transitions_entity_idx ON state_transitions (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES opportunities(id),
  job_id uuid REFERENCES jobs(id),
  role text NOT NULL,
  purpose text NOT NULL,
  model text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  token_input bigint,
  token_output bigint,
  cost numeric,
  status text NOT NULL DEFAULT 'SUCCESS',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_key text NOT NULL UNIQUE,
  category text,
  occurrence_count integer NOT NULL DEFAULT 0,
  opportunity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reuse_score numeric NOT NULL DEFAULT 0,
  monetization_hypothesis text,
  status text NOT NULL DEFAULT 'OBSERVING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
