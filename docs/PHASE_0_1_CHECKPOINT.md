# Phase 0 + Phase 1 Checkpoint

Date: 2026-08-22
Repository: `ngtrhieuut/codex_job_hunter`
Issue: [#1 — Phase 0–1: Build Codex Job Hunter MVP](https://github.com/ngtrhieuut/codex_job_hunter/issues/1)
Review target: Draft PR #2

## Outcome

The MVP now has an explicit durable-runtime boundary:

- PostgreSQL/Neon is the transactional runtime store when `APP_STORE=postgres`.
- GitHub is the auditable, recoverable operational ledger for job workspaces and `CONTROL_BOARD.md`.
- JSON is an explicit development/test fallback only (`APP_STORE=json`); production JSON is blocked unless the emergency override is deliberately set.
- Missing production `DATABASE_URL`, GitHub credentials, or repository configuration fails fast. The runtime does not silently fall back to local JSON.

This checkpoint addresses the manager review blockers on PR #2: PostgreSQL wiring, full workspace ledger coverage, configurable path consistency, restart durability tests, operational job files, reconciliation, and source-of-truth documentation.

## Implemented

- Next.js App Router + TypeScript single-owner internal application scaffold.
- PostgreSQL/Neon migrations for opportunities, immutable score snapshots, proposals, approvals, applications, jobs, criteria, tasks, QA, delivery, economics, transitions, settings, decision/activity ledgers, and reconciliation conflicts.
- `PostgresAppStore` with parameterized SQL, transactional state mutations, complete `AppState` reconstruction, and JSON-compatible row mappers.
- PostgreSQL JSONB writes use typed `postgres.json(...)` parameters; object/array shape is verified directly with `jsonb_typeof` and metadata operators in the live round-trip test.
- Explicit `APP_STORE=json|postgres` selection in `src/lib/store.ts`; production PostgreSQL mode requires `DATABASE_URL`, `GITHUB_TOKEN`, and `GITHUB_REPOSITORY`.
- Local JSON store with atomic file replacement and serialized writes for offline development/tests.
- Manual entry and validated CSV/JSON import with row/path errors.
- Public GitHub issue discovery adapter with provenance/evidence metadata; no comments, PRs, applications, or client messaging.
- Normalization, safe URL handling, category/technology/deliverable/acceptance inference, deterministic dedupe, and UUID-compatible stable opportunity IDs.
- Hard filters with reason codes for prohibited work, scams, unpaid work, circumvention, excluded categories, low budget, physical constraints, and vague low-value scope.
- Immutable `score_v1` snapshots with documented weights, risk adjustment, economic estimates, human-readable explanation, and revenue/token efficiency.
- Ranked opportunity inbox, filters/sorting, detail page, risks/assumptions, proposal draft interface, shortlist/reject path, and settings.
- Human-gated Apply, Price, Contract, Scope, Delivery, Spend, and account-change boundaries. No autonomous external application or client messaging exists.
- Per-job permanent workspaces with `STATE.md`, `BRIEF.md`, `TASKS.md`, `DECISIONS.md`, `ACTIVITY.md`, `REVIEW.md`, `DELIVERY.md`, and artifacts.
- Operational renderers for tasks, QA/review evidence, and delivery package state; these files are regenerated from durable runtime records rather than left as static templates.
- Append-only activity and decision history, persistent approval/decision rows, manual application records, QA evidence, delivery records, economic outcomes, and task status updates.
- GitHub Git Data API checkpoint writer: all seven required workspace files, relevant artifacts, and `CONTROL_BOARD.md` are written through one tree/commit/ref update. A ref race fails rather than silently producing a partial checkpoint.
- Configurable local paths (`JOBS_ROOT`, `CONTROL_BOARD_PATH`) and repository paths (`GITHUB_JOBS_ROOT`, `GITHUB_CONTROL_BOARD_PATH`) use separate, explicit path helpers.
- DB ↔ local workspace ↔ GitHub ledger reconciliation, persisted conflict records, dashboard/API visibility, and board regeneration.
- Seed fixture with 100 input rows, duplicate detection, hard rejects, and scored candidates.
- CI workflow for formatting, lint, typecheck, tests, and a JSON-mode production build.
- Truthful proposal templates; no portfolio, identity, credentials, client, or experience fabrication.

## Verification evidence

| Check | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (local JSON/CI mode) | PASS — 25 passed, 2 conditional PostgreSQL tests skipped because `DATABASE_URL` is not configured |
| `pnpm test` (`APP_STORE=postgres` against dedicated Neon) | PASS — 27 tests passed; full lifecycle completed in approximately 231 seconds |
| Live JSONB shape regression (`postgres-store.test.ts`) | PASS — raw metadata/object and technology/list fields are stored as queryable JSONB object/arrays, not text-encoded JSON scalars |
| `pnpm build` | PASS — Next.js 15.5.21 with explicit local JSON override |
| `pnpm db:migrate` against dedicated Neon | PASS — both migrations applied; rerun is idempotent with expected PostgreSQL skip notices |
| `pnpm db:migrate` without `DATABASE_URL` | PASS — safe local-mode message; no remote mutation |
| `pnpm db:seed` | PASS — 100 imported, 7 scored, 3 hard rejected, 90 duplicates; temp JSON state only |
| `pnpm audit --prod` | PASS — no known vulnerabilities; npm URL deprecation warning only |
| Browser visual runner | Not available in this runtime; use HTTP/build checks instead |

The restart suite covers:

1. multiple independent jobs and states after store reinitialization;
2. pending Apply Gate approval, decision row, and next action;
3. the three-job `IN_PROGRESS` WIP limit after restart;
4. QA evidence and review state after restart;
5. delivery/economic outcome persistence after restart.

The checkpoint suite covers all seven required files, nested artifacts, configurable local-to-repository paths, one Git Data API commit, and failure when a required file is missing. A conditional live PostgreSQL round-trip test runs automatically when `DATABASE_URL` is available and migrations have been applied. `tests/integration/postgres-live-lifecycle.test.ts` extends this with a full opportunity → shortlist → Apply Gate → manual application → won → price/contract gates → job → QA → delivery gate → restart/readback → accepted → paid lifecycle.

## Source-of-truth and recovery model

PostgreSQL/Neon is authoritative for transactional runtime state and queries. GitHub is the durable, human-readable audit/recovery ledger. Local workspace files are the working materialized view used for review and checkpoint generation. Reconciliation reports conflicts; it does not silently choose DB or file state.

`ACTIVITY.md` and `DECISIONS.md` are append-only. `STATE.md`, `TASKS.md`, `REVIEW.md`, `DELIVERY.md`, and `CONTROL_BOARD.md` are current materialized views regenerated from durable records. A GitHub checkpoint carries the full required workspace set plus artifacts and the board in one logical commit.

## Current system state

- No real client job has been accepted, started, delivered, or paid.
- No external proposal, application, client message, contract acceptance, spend, or account change was performed.
- `CONTROL_BOARD.md` intentionally has no managed jobs or pending human decisions in the committed baseline.
- `pnpm db:seed` is available for a local demo; its `.data/` state is ignored and must not be treated as the GitHub operational ledger.
- Phase 2 read-only scouting is now persisted in the dedicated Neon project; see [docs/FIRST_100_SCOUT_2026-08-22.md](FIRST_100_SCOUT_2026-08-22.md) for the 13-record evidence set and current no-shortlist decision.

## Known limitations

1. Live Neon/PostgreSQL validation passed against the dedicated `codex-job-hunter` project on 2026-08-22. The full lifecycle test takes approximately 186–231 seconds on the pooled Neon connection because of compute cold-start and repeated checkpoint round-trips; its explicit timeout is 300 seconds. CI without `DATABASE_URL` still skips live tests by design.
2. GitHub checkpointing creates blobs/tree/commit objects before the final ref update. A failed ref update can leave orphan Git objects, but cannot create a partial logical checkpoint in the branch.
3. The reconciliation endpoint is owner-gated for writes, but the single-owner token/cookie mechanism is not a multi-user identity system.
4. GitHub issue compensation is evidence/uncertainty only; the adapter cannot prove that an issue is paid.
5. Score feature inference is deterministic heuristics in this phase. Recalibrate weights and source/category priors after real outcomes; never rewrite historical snapshots.
6. The browser visual runner was unavailable in this desktop runtime. Build, lint, typecheck, integration, and HTTP checks remain the applicable evidence.

## Readiness for the first controlled experiment

The MVP is ready for manager re-review and a small, human-controlled experiment. The dedicated PostgreSQL/Neon live lifecycle/restart evidence now passes; deployment still needs the secret runtime configuration and GitHub checkpoint credentials. The first target remains one legitimate accepted paid job / first $100, not application volume.

Recommended loop:

1. Run `pnpm db:migrate` against the configured PostgreSQL database.
2. Set `APP_STORE=postgres`, `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and the intended branch/path settings.
3. Inspect score explanation, risks, missing evidence, and expected human/token economics.
4. Shortlist only objective, compliant, well-scoped opportunities.
5. Review the persistent Apply Gate and manually submit only approved proposals.
6. Keep `IN_PROGRESS` at or below three jobs; checkpoint after every meaningful milestone.
7. Run reconciliation when a restart, failed checkpoint, or manual file edit could have created drift.
8. Require independent QA and Delivery Gate before any owner-controlled client delivery.
9. Record paid revenue, platform fees, tokens, human minutes, revisions, and acceptance outcome.

## Deferred scope

- No new opportunity providers or autonomous external actions.
- No autonomous proposal submission, client messaging, contract acceptance, spending, or account changes.
- Proposal version editing and richer manual outcome forms can follow after the persistence boundary is accepted.
