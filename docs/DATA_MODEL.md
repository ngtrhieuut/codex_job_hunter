# Data Model

This is a logical model. Codex may refine table/field names during implementation, but preserve auditability and state history.

## opportunity

- id UUID
- source
- external_id nullable
- source_url nullable
- title
- original_description
- normalized_summary nullable
- category nullable
- technologies JSON
- deliverables JSON
- inferred_acceptance_criteria JSON
- missing_information JSON
- budget_min nullable
- budget_max nullable
- currency nullable
- explicit_deadline nullable
- discovered_at
- posted_at nullable
- raw_metadata JSON
- status
- hard_filter_reason nullable
- duplicate_of nullable
- created_at
- updated_at

Indexes:
- source + external_id unique where available
- status
- category
- discovered_at

## opportunity_score

Immutable scoring snapshot.

- id UUID
- opportunity_id
- scoring_version
- technical_fit
- completion_probability
- scope_clarity
- payment_quality
- repeatability
- client_quality
- verification_quality
- implementation_effort
- human_attention
- communication_burden
- revision_risk
- platform_risk
- security_risk
- scope_creep_risk
- scam_risk
- overall_score
- estimated_ai_minutes nullable
- estimated_human_minutes nullable
- estimated_tokens nullable
- win_probability nullable
- expected_net_revenue nullable
- expected_revenue_per_1m_tokens nullable
- assumptions JSON
- risk_flags JSON
- explanation JSON
- created_at

## proposal

- id UUID
- opportunity_id
- version
- opening
- requirement_interpretation
- implementation_plan
- proof_points JSON
- assumptions JSON
- questions JSON
- recommended_bid nullable
- minimum_bid nullable
- currency nullable
- timeline_recommendation nullable
- scope_included JSON
- scope_excluded JSON
- body
- status DRAFT|APPROVED|SUPERSEDED|SUBMITTED
- created_at
- updated_at

## approval

- id UUID
- opportunity_id nullable
- job_id nullable
- approval_type APPLY|PRICE|CONTRACT|SCOPE_CHANGE|DELIVERY|SPEND|ACCOUNT_CHANGE
- requested_payload JSON
- decision PENDING|APPROVED|REJECTED
- decision_note nullable
- requested_at
- decided_at nullable

## application

- id UUID
- opportunity_id
- proposal_id nullable
- submitted_at nullable
- submitted_via MANUAL|OFFICIAL_API|OTHER_PERMITTED
- actual_bid nullable
- currency nullable
- status PREPARED|SUBMITTED|LOST|WON|WITHDRAWN
- external_reference nullable
- notes nullable

## job

Created only after a won opportunity is contract-approved.

- id UUID
- opportunity_id
- title
- agreed_scope JSON
- agreed_price
- currency
- agreed_deadline nullable
- status ACTIVE|SCOPE_CHANGE_REVIEW|READY_FOR_QA|QA_FAILED|READY_FOR_DELIVERY|DELIVERED|REVISION|ACCEPTED|PAID|CANCELLED
- started_at
- completed_at nullable
- created_at
- updated_at

## acceptance_criterion

- id UUID
- job_id
- description
- verification_method nullable
- status TODO|PASS|FAIL|WAIVED
- evidence nullable
- created_at
- updated_at

## job_task

- id UUID
- job_id
- title
- description nullable
- agent_role nullable
- status TODO|IN_PROGRESS|BLOCKED|DONE
- estimate_minutes nullable
- actual_minutes nullable
- blocked_reason nullable
- created_at
- updated_at

## scope_change

- id UUID
- job_id
- requested_change
- effort_delta_minutes nullable
- price_delta_recommendation nullable
- deadline_delta nullable
- risk_delta JSON
- recommendation
- status PENDING|APPROVED|REJECTED
- created_at
- decided_at nullable

## qa_run

- id UUID
- job_id
- run_number
- criteria_result JSON
- tests_result JSON
- security_result JSON
- documentation_result JSON
- verdict PASS|FAIL
- issues JSON
- created_at

## delivery

- id UUID
- job_id
- version
- summary
- instructions
- tests_performed JSON
- limitations JSON
- artifacts JSON
- status DRAFT|APPROVED|DELIVERED|SUPERSEDED
- created_at
- delivered_at nullable

## economic_outcome

- id UUID
- job_id
- gross_revenue
- platform_fees default 0
- external_costs default 0
- net_revenue
- token_count nullable
- estimated_ai_minutes nullable
- actual_human_minutes nullable
- revisions_count default 0
- payment_status UNPAID|PARTIAL|PAID|REFUNDED
- paid_at nullable
- created_at
- updated_at

## state_transition

Append-only audit table.

- id UUID
- entity_type OPPORTUNITY|APPLICATION|JOB|DELIVERY
- entity_id
- from_state nullable
- to_state
- actor OWNER|SYSTEM|AGENT
- reason nullable
- metadata JSON
- created_at

## agent_run

Useful for cost/quality analysis.

- id UUID
- opportunity_id nullable
- job_id nullable
- role
- purpose
- model nullable
- started_at
- ended_at nullable
- token_input nullable
- token_output nullable
- cost nullable
- status SUCCESS|FAILURE|CANCELLED
- metadata JSON

## provider_config

Never store secrets directly.

- id UUID
- provider
- enabled
- settings JSON
- secret_reference nullable
- created_at
- updated_at

## system_setting

- key unique
- value JSON
- updated_at

Initial settings:
- minimum_budget
- maximum_estimated_ai_minutes
- maximum_estimated_human_minutes
- shortlist_score_threshold = 75
- minimum_completion_probability
- allowed_categories
- excluded_categories
- preferred_sources
- preferred_currencies
- risk_tolerance

## product_signal

- id UUID
- problem_key
- category
- occurrence_count
- opportunity_ids JSON
- reuse_score
- monetization_hypothesis nullable
- status OBSERVING|PRODUCT_CANDIDATE|APPROVED|REJECTED|BUILT
- created_at
- updated_at
