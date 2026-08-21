# Job State & Review Protocol

## Purpose

Codex Job Hunter must remain understandable when dozens or hundreds of opportunities/jobs are active at once. GitHub is the durable operational ledger shared by Codex, the owner, and external reviewers/assistants.

The database may power the UI, but **important operational state must also be persisted in GitHub** so progress, blockers, decisions, and completed work can be reviewed asynchronously and reconstructed from git history.

## Canonical job workspace

Every shortlisted opportunity or accepted job receives its own directory:

```text
jobs/
  JOB-YYYYMMDD-NNN-short-slug/
    STATE.md
    BRIEF.md
    TASKS.md
    DECISIONS.md
    ACTIVITY.md
    REVIEW.md
    DELIVERY.md
    artifacts/
```

Do not combine multiple client jobs into one state file.

The directory ID is permanent even if the job title changes.

## Required files

### STATE.md
Machine- and human-readable current snapshot. It is the first file every agent must read before touching a job.

Required fields:

```yaml
job_id: JOB-20260821-001
source: github|upwork|fiverr|manual|other
source_url: ""
title: ""
status: DISCOVERED
priority: P2
owner: codex
created_at: ISO-8601
updated_at: ISO-8601
job_score: 0
estimated_value_usd: 0
actual_revenue_usd: 0
risk: LOW|MEDIUM|HIGH|CRITICAL
human_gate: NONE
next_action: ""
next_action_owner: codex|human|client|external
blocked_by: []
branch_or_pr: ""
last_checkpoint_commit: ""
```

After the frontmatter, include a short human summary: current situation, what changed last, and what should happen next.

### BRIEF.md
Immutable-ish understanding of the job:
- original request/source excerpt or normalized summary
- objectives
- scope included
- explicit exclusions
- acceptance criteria
- assumptions
- dependencies
- commercial terms if known

Update only when new facts are confirmed; record material changes in `DECISIONS.md`.

### TASKS.md
Execution checklist grouped by milestone. Every task has one of:
- `[ ]` pending
- `[-]` in progress
- `[x]` done
- `[!]` blocked

Each meaningful task should include owner and, when useful, commit/PR evidence.

### DECISIONS.md
Append-only decision ledger. Record:
- date/time
- decision ID
- question
- options considered
- recommendation
- final decision
- decided by: owner/client/codex
- resulting scope/state change

Never silently overwrite a material commercial, scope, architecture, or delivery decision.

### ACTIVITY.md
Append-only operational journal. Add a concise checkpoint whenever Codex completes a meaningful unit of work, encounters a blocker, changes status, requests human input, receives a decision, opens/updates a PR, completes QA, or prepares delivery.

Each entry:

```text
## 2026-08-21T21:30:00+07:00 — CHECKPOINT-007
Type: COMPLETED | BLOCKED | NEEDS_DECISION | REVIEW | STATE_CHANGE
Actor: codex
Summary: ...
Evidence: commit/PR/test/log/path
Next: ...
```

Do not log every trivial code edit. Log meaningful work units so the journal stays useful.

### REVIEW.md
Independent review record. Keep sections:
- Review requested
- Acceptance criteria coverage
- Tests/build evidence
- Security/privacy concerns
- Scope compliance
- Defects found
- Required changes
- Final verdict: NOT_REVIEWED | CHANGES_REQUESTED | APPROVED_INTERNAL | READY_FOR_HUMAN_REVIEW

The Builder must not self-certify final delivery. A QA/reviewer agent should perform the final internal review when feasible.

### DELIVERY.md
Prepared client-facing delivery package, but not automatically sent. Include:
- deliverables
- setup/use instructions
- verification steps
- known limitations
- files/PR/commit references
- suggested client message
- final human approval status

## State machine

Allowed primary states:

```text
DISCOVERED
SCORED
SHORTLISTED
REQUIRES_APPLY_APPROVAL
APPLY_APPROVED
APPLIED
CLIENT_RESPONSE
REQUIRES_COMMERCIAL_DECISION
NEGOTIATING
WON
PLANNING
IN_PROGRESS
BLOCKED_INTERNAL
BLOCKED_CLIENT
REQUIRES_SCOPE_APPROVAL
READY_FOR_INTERNAL_REVIEW
CHANGES_REQUESTED
READY_FOR_HUMAN_REVIEW
REQUIRES_DELIVERY_APPROVAL
DELIVERED
REVISION_REQUESTED
ACCEPTED
PAID
CLOSED_WON
CLOSED_LOST
REJECTED
ARCHIVED
```

Transitions that create external, financial, contractual, scope, or delivery commitments require the appropriate human gate from `AGENTS.md`.

## Human attention queue

Whenever Codex needs the owner's opinion, it MUST:

1. update that job's `STATE.md`
2. set `human_gate` to a specific gate
3. set status to the corresponding `REQUIRES_*` state
4. append a `NEEDS_DECISION` entry to `ACTIVITY.md`
5. append/update the pending item in root `CONTROL_BOARD.md`
6. commit those changes with a message beginning `needs-decision(<job_id>): ...`
7. stop the gated action until a decision is recorded

The question must be decision-ready, not vague. Include recommendation, alternatives, upside/downside, and the exact action that will occur after approval.

## Completion checkpoint rule

Whenever Codex finishes a meaningful task or milestone, it MUST persist the result before starting unrelated work:

1. mark the relevant item in `TASKS.md`
2. append evidence to `ACTIVITY.md`
3. update `STATE.md` (`updated_at`, status if changed, next action)
4. update `CONTROL_BOARD.md` if status/priority/human attention changed
5. commit with one of:
   - `checkpoint(<job_id>): ...`
   - `complete(<job_id>): ...`
   - `review(<job_id>): ...`
   - `blocked(<job_id>): ...`

This makes git history a recoverable audit log.

## Concurrency rules

Codex may execute multiple jobs in parallel, but:
- one job = one workspace directory
- preferably one git branch/PR per active client job
- never mix unrelated client changes in the same commit
- before working, read `STATE.md` and `TASKS.md`
- after working, write a checkpoint
- respect `max_active_jobs` configuration
- prioritize human-approved paid work over speculative opportunities
- do not start a new build if active WIP exceeds the configured limit unless the owner explicitly overrides it

Recommended initial WIP limits:
- `IN_PROGRESS`: max 3
- `READY_FOR_INTERNAL_REVIEW`: max 3
- human-decision queue: no hard limit, but surface oldest/highest-value first

## Review policy

A job cannot become `READY_FOR_HUMAN_REVIEW` until:
- all acceptance criteria are mapped to evidence
- tests/build relevant to the job pass
- unresolved defects are documented
- scope has been checked against `BRIEF.md`
- security/privacy has been considered
- `REVIEW.md` contains an independent verdict

A job cannot become `DELIVERED` without the Delivery human gate.

## Synchronization with app/database

The app/database is optimized for querying; the GitHub files are optimized for durable collaboration/audit.

Implement a sync service that can regenerate/update `STATE.md` and `CONTROL_BOARD.md` from canonical records, but preserve append-only decision/activity history. Do not destructively rewrite ACTIVITY or DECISIONS during synchronization.

If database state and GitHub state disagree, flag `STATE_CONFLICT` for human review rather than silently choosing one when the discrepancy is material.
