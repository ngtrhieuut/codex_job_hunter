# Codex Job Hunter — Control Board

This is the operational index for all jobs. Codex must keep it current whenever a job changes status, priority, blocker, or human-gate requirement.

> Source of detail: each `jobs/<JOB-ID>/STATE.md`. This board is a summary, not a replacement for per-job state.

## SYSTEM CHECKPOINT

- Phase 0 + Phase 1 MVP implemented and verified on 2026-08-22.
- Baseline has no real managed jobs, pending human decisions, active client work, or payment records.
- Local demo data is generated with `pnpm db:seed` into ignored `.data/`; it is not committed operational state.
- Next controlled experiment: select one legitimate, well-scoped opportunity and prove the human-gated discovery → QA → delivery → payment loop.

## HUMAN ACTION REQUIRED

| Priority | Job | Decision needed | Recommendation | Since | Link |
|---|---|---|---|---|---|
| — | — | No pending human decisions | — | — | — |

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
| — | — | No blocked jobs | — | — | — | — |

## PIPELINE / SHORTLIST

| Rank | Job | Status | Score | Est. value | Completion probability | Risk | Recommended action |
|---:|---|---|---:|---:|---:|---|---|
| — | — | No shortlisted jobs | — | — | — | — | — |

## RECENTLY COMPLETED

| Job | Outcome | Revenue | Human time | Token/AI usage | Closed |
|---|---|---:|---:|---:|---|
| — | No completed jobs yet | — | — | — | — |

## Operating rules

1. `HUMAN ACTION REQUIRED` is always the highest-attention section.
2. Codex must write decision-ready questions; never write only “need help”.
3. Paid/won jobs outrank speculative jobs unless explicitly overridden.
4. Initial WIP target: no more than 3 jobs in `IN_PROGRESS` simultaneously.
5. Every row must link to its per-job directory once jobs exist.
6. Job detail/history belongs in the job directory, not in this board.
7. Completed jobs move out of active sections but their folders remain permanently for learning/audit.

## Recommended owner review loop

When the owner or ChatGPT reviews the repository, read in this order:

1. `CONTROL_BOARD.md`
2. all jobs under `HUMAN ACTION REQUIRED`
3. all jobs under `READY FOR REVIEW`
4. blocked high-value jobs
5. active work / pipeline only if deeper review is needed

This keeps management efficient even when the repository contains many jobs.
