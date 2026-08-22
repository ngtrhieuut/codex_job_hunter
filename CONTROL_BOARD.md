# Codex Job Hunter — Control Board

This is the operational index for all jobs. PostgreSQL/Neon is the transactional runtime in production; GitHub is the auditable operational ledger and recovery surface. Local JSON is development/test-only. Append-only job history remains in each workspace.

> Source of detail: each `jobs/<JOB-ID>/STATE.md`. This board is a summary, not a replacement for per-job state.

## SYSTEM CHECKPOINT

- Phase 0 + Phase 1 MVP implemented; local/CI and live Neon/PostgreSQL verification passed on 2026-08-22.
- Phase 2 / First $100 discovery is **APPLY_GATE_PENDING / PERSISTED_NEON**. The dated scouting evidence is [docs/FIRST_100_SCOUT_2026-08-22.md](docs/FIRST_100_SCOUT_2026-08-22.md): 14 unique public records persisted to Neon, 10 operationally cancelled, 3 deterministic hard rejects, and 1 managed job awaiting Apply approval.
- Dedicated Neon runtime: project `codex-job-hunter` (`sweet-frog-85939680`), branch `br-withered-resonance-afwcaan8`, database `neondb`; see [docs/NEON_OPERATIONS.md](docs/NEON_OPERATIONS.md).
- `APP_STORE=json` is an explicit development/test fallback only. Production requires `APP_STORE=postgres` and `DATABASE_URL`; durable-runtime configuration fails fast when missing.
- External applications, messages, contracts, commercial terms, spend, account changes, and delivery remain human-gated.
- Current controlled action: review the Guru Apply Gate for `JOB-20260822-001-move-5-python-services-to-github`; do not continue scouting until that decision is made.

## HUMAN ACTION REQUIRED

| Priority | Job | Decision needed | Recommendation / next action | Owner | Updated |
|---|---|---|---|---|---|
| P2 | [JOB-20260822-001-move-5-python-services-to-github](jobs/JOB-20260822-001-move-5-python-services-to-github/STATE.md) | APPLY | Review the evidence, approve/reject a manual Guru quote, and confirm the final bid/timeline before any external action. | human | 2026-08-22T03:59:04.958Z |

## ACTIVE WORK

| Priority | Job | Status | Score | Value | Risk | Owner | Next action | Updated |
|---|---|---:|---:|---:|---|---|---|---|
| — | — | — | — | — | — | — | — | — |

## READY FOR REVIEW

| Job | Internal verdict | Human action | Evidence | Updated |
|---|---|---|---|---|
| — | — | No jobs awaiting review | — | — |

## BLOCKED

| Priority | Job | Status | Blocker | Waiting on | Age | Updated |
|---|---|---|---|---|---|---|
| — | — | No blocked jobs | — | — | — | — |

## PIPELINE / SHORTLIST

| Rank | Opportunity | Status | Score | Est. value | Completion probability | Risk | Recommended action |
|---:|---|---|---:|---:|---:|---|---|
| 1 | [Move 5 Python Services to GitHub](jobs/JOB-20260822-001-move-5-python-services-to-github/STATE.md) | REQUIRES_APPLY_APPROVAL | 81.3 | $19.20 | 96.00 | implementation_effort | Review Apply Gate; no quote sent |

Current watchlist is audit-only: Freelancer `39701031` remains `REJECTED_HARD_FILTER` pending exact page count, total scope, access, and payment verification. It is not a managed job and has no Apply Gate.

## RECENTLY COMPLETED

| Job | Outcome | Revenue | Human time | Token/AI usage | Closed |
|---|---|---:|---:|---:|---|
| — | No completed jobs yet | — | — | — | — |

## RECONCILIATION CONFLICTS

| Job | Conflict | Details |
|---|---|---|
| — | No unresolved reconciliation conflicts | — |

## Operating rules

1. `HUMAN ACTION REQUIRED` is always the highest-attention section.
2. Codex must write decision-ready questions; never write only “need help”.
3. Paid/won jobs outrank speculative jobs unless explicitly overridden.
4. Initial WIP target: no more than 3 jobs in `IN_PROGRESS` simultaneously.
5. Every row must link to its per-job directory once jobs exist.
6. Job detail/history belongs in the job directory; this board is a one-minute summary.
7. Completed jobs move out of active sections but their folders remain permanently for learning/audit.
8. Reconciliation reports DB ↔ workspace ↔ GitHub drift; it never silently selects a source.

## Recommended owner review loop

When the owner or ChatGPT reviews the repository, read in this order:

1. `CONTROL_BOARD.md`
2. all jobs under `HUMAN ACTION REQUIRED`
3. all jobs under `READY FOR REVIEW`
4. blocked high-value jobs
5. active work / pipeline only if deeper review is needed

This keeps management efficient even when the repository contains many jobs.
