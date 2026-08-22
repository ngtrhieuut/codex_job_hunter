# Codex Job Hunter — Control Board

This is the operational index for all jobs. PostgreSQL/Neon is the transactional runtime in production; GitHub is the audit/recovery ledger. Codex must keep this materialized view current whenever a job changes status, priority, blocker, or human-gate requirement.

> Source of detail: each `jobs/<JOB-ID>/STATE.md`. This board is a summary, not a replacement for per-job state.

## SYSTEM CHECKPOINT

- Phase 0 + Phase 1 MVP implemented; local/CI verification passed on 2026-08-22, while live Neon/PostgreSQL deployment validation remains blocked below.
- Baseline has no real managed jobs, pending human decisions, active client work, or payment records.
- `APP_STORE=json` is an explicit development/test fallback only. Local demo data is generated with `pnpm db:seed` into ignored `.data/`; it is not the production runtime or GitHub operational ledger.
- Production requires `APP_STORE=postgres`, `DATABASE_URL`, `GITHUB_TOKEN`, and `GITHUB_REPOSITORY`; missing durable-runtime configuration fails fast.
- Each checkpoint carries the seven required job files, relevant artifacts, and this board through one Git Data API commit.
- Live Phase 0–1 deployment validation is **BLOCKED**: Neon MCP currently exposes only the unrelated `phudong-class-management` project, and this runtime has no `DATABASE_URL`. No migration or live PostgreSQL lifecycle test has run against the intended database.
- Phase 2 / First $100 discovery is **READ_ONLY**. The dated scouting evidence is [docs/FIRST_100_SCOUT_2026-08-22.md](docs/FIRST_100_SCOUT_2026-08-22.md); no opportunity is persisted or shortlisted until the durable runtime and current availability are verified.
- Next controlled experiment: after the database blocker is cleared, select one legitimate, well-scoped opportunity and prove the human-gated discovery → QA → delivery → payment loop.

## HUMAN ACTION REQUIRED

| Priority | Job | Decision needed | Recommendation | Since | Link |
|---|---|---|---|---|---|
| P0 | SYSTEM-NEON | Provide the intended `DATABASE_URL`/Neon project, or explicitly approve provisioning a dedicated project | Do not use `phudong-class-management`; after configuration run migrations, live PostgreSQL lifecycle/restart tests, and reconciliation | 2026-08-22 | [live validation note](docs/FIRST_100_SCOUT_2026-08-22.md#persistence-and-next-action) |

## ACTIVE WORK

| Priority | Job | Status | Score | Value | Risk | Owner | Next action | Updated |
|---|---|---:|---:|---:|---|---|---|---|
| — | — | No active jobs | — | — | — | — | — | — |

## READY FOR REVIEW

| Priority | Job | Internal verdict | Human action | Evidence | Updated |
|---|---|---|---|---|---|
| — | — | No jobs awaiting review | — | — | — |

## BLOCKED

| Priority | Job | Status | Blocker | Waiting on | Age | Updated |
|---|---|---|---|---|---|---|
| P0 | SYSTEM-NEON | `BLOCKED_INTERNAL` | Correct Neon target and `DATABASE_URL` are unavailable; live migration/durability evidence cannot be produced safely | Hieu | 0 days | 2026-08-22 |

## PIPELINE / SHORTLIST

| Rank | Job | Status | Score | Est. value | Completion probability | Risk | Recommended action |
|---:|---|---|---:|---:|---:|---|---|
| — | — | No shortlisted jobs | — | — | — | — | — |

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
6. Job detail/history belongs in the job directory, not in this board.
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
