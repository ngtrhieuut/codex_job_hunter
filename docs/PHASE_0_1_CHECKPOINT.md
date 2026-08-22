# Phase 0 + Phase 1 Checkpoint

Date: 2026-08-22
Repository: `ngtrhieuut/codex_job_hunter`
Issue: [#1 — Phase 0–1: Build Codex Job Hunter MVP](https://github.com/ngtrhieuut/codex_job_hunter/issues/1)

## Implemented

- Next.js App Router + TypeScript single-owner internal application scaffold.
- PostgreSQL/Neon-compatible schema and initial migration for the Phase 0–1 logical model.
- Local-first durable JSON store for zero-credential development and demo/seed data.
- Manual opportunity creation and validated CSV/JSON import with row/path errors.
- Provider interface and public GitHub issue adapter with provenance/evidence metadata.
- Normalization, safe URL handling, categories/technologies/deliverables/acceptance inference, and deterministic dedupe.
- Hard filters with reason codes for prohibited work, scams, unpaid work, circumvention, excluded categories, low budget, physical constraints, and vague low-value scope.
- Immutable `score_v1` snapshots with documented weights, risk adjustment, economic estimates, human-readable explanation, and revenue/token efficiency.
- Ranked opportunity inbox, filters/sorting, detail page, risks/assumptions, proposal draft interface, shortlist/reject path, and settings.
- Human-gated Apply, Price, Contract, Scope, Delivery, Spend, and account-change boundaries. No autonomous external application or client messaging exists.
- Per-job workspace creation from the repository templates, append-safe activity/decision records, state snapshots, checkpoint/control-board synchronization, WIP limit enforcement, state-conflict detection, and QA/review/delivery queues.
- Seed fixture with 100 input rows, duplicate detection, hard rejects, and scored candidates.
- CI workflow for format, lint, typecheck, tests, and production build.
- Truthful proposal templates; no portfolio, identity, credentials, client, or experience fabrication.

## Verification evidence

| Check | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 10 tests (6 domain, 4 integration) |
| `pnpm build` | PASS — Next.js 15.5.21 |
| `pnpm db:migrate` without `DATABASE_URL` | PASS — safe local-mode message |
| `pnpm db:seed` | PASS — 100 rows, 90 duplicates, 3 hard rejects, 7 scored |
| `pnpm audit --prod` | PASS — No known vulnerabilities found |
| HTTP smoke (`/`, `/opportunities`) | PASS — HTTP 200 and expected rendered content |
| `agent-browser` visual runner | NOT AVAILABLE in this runtime; CLI was not on PATH |

The integration tests demonstrate: independent job directories, persistent Apply Gate state and decision history, two-job isolation, WIP limit `3`, and active → internal review → independent QA → Delivery Gate flow.

## Current system state

- No real client job has been accepted, started, delivered, or paid.
- No external proposal/application/client message was sent.
- `CONTROL_BOARD.md` intentionally has no managed jobs or pending human decisions in the committed baseline.
- `pnpm db:seed` is available for a local demo; its `.data/` state is ignored and must not be treated as the GitHub operational ledger.

## Known limitations / unresolved decisions

1. The runtime repository is JSON-backed for local-first operation. Wire `PostgresAppStore` before multi-instance deployment or concurrent production users.
2. GitHub Contents checkpoint sync currently writes changed files individually. Use Git Data API tree/commit batching if atomic multi-file checkpoints become necessary.
3. The optional owner auth is a lightweight single-owner token/cookie gate, not a multi-user identity system.
4. GitHub issue compensation is evidence/uncertainty only; the adapter cannot prove that an issue is paid.
5. Score feature inference is deterministic heuristics in this phase. Recalibrate weights and source/category priors after real outcomes; never rewrite historical snapshots.
6. The visual browser runner was unavailable in this desktop runtime. HTTP smoke, build, and integration verification passed.

## Readiness for the first controlled experiment

The MVP is ready for a small, human-controlled experiment after the owner configures a private deployment/local environment and verifies the GitHub search query. The first target remains one legitimate accepted paid job / first $100, not application volume.

Recommended operating loop:

1. Run `pnpm db:seed` only for a local UI walkthrough; for real work use manual or permitted GitHub discovery.
2. Inspect score explanation, risks, missing evidence, and expected human/token economics.
3. Shortlist only objective, compliant, well-scoped opportunities.
4. Review the persistent Apply Gate and manually submit only approved proposals.
5. Record responses and Contract/Price decisions; create the job workspace only for selected work.
6. Keep `IN_PROGRESS` at or below three jobs; checkpoint after every meaningful milestone.
7. Require independent QA and Delivery Gate before any owner-controlled client delivery.
8. Record paid revenue, platform fees, tokens, human minutes, revisions, and acceptance outcome.

## Recommended Phase 2

- Replace/augment the JSON store with the PostgreSQL repository adapter and migration runner in deployment.
- Add proposal version editing and auditable Apply/Price approval UI refinements.
- Add manual application/outcome and economic-outcome forms.
- Add a single-commit GitHub checkpoint writer and a reconciliation view for database/file conflicts.
- Add optional permitted email/RSS providers only after policy/rate-limit review; keep external writes human-gated.
