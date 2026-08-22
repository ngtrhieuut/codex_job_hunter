# MVP Architecture — Phase 0 + Phase 1

## Runtime shape

Codex Job Hunter is one Next.js App Router application. The UI is a server-rendered decision cockpit; mutation routes are explicit internal operations and never submit applications or send client messages.

```text
Next.js pages / API routes
        |
        +-- domain services (pure TypeScript)
        |     normalize -> dedupe -> hard filters -> score_v1
        |     import validation -> state machine -> WIP checks
        |
        +-- AppStore
        |     +-- PostgresAppStore (APP_STORE=postgres, production)
        |     +-- JsonAppStore (APP_STORE=json, development/tests only)
        +-- PostgreSQL/Neon migrations (db/migrations)
        +-- provider adapters (manual, CSV/JSON, GitHub public issues)
        +-- job workspace / atomic GitHub Git Data checkpoint adapter (jobs/<JOB-ID> + CONTROL_BOARD.md)
```

## Boundaries

- `src/domain/` is framework- and database-independent. It accepts JSON-compatible values, making scoring and validation deterministic and testable.
- `src/providers/` contains permitted source adapters. The GitHub adapter uses public issue search and records repository/label/bounty evidence; it does not comment, open PRs, contact maintainers, or submit proposals.
- `src/lib/ingestion.ts` orchestrates normalization, deduplication, hard filters, score snapshots, and store writes. Hard filters run before score generation.
- `src/lib/operations.ts` is the human-gated application/job state layer. It validates transitions, creates approval records, enforces the WIP limit, and checkpoints workspaces.
- `src/lib/job-workspace.ts` creates the required seven Markdown files plus `artifacts/`, renders operational `TASKS.md`, `REVIEW.md`, and `DELIVERY.md`, updates `STATE.md`, appends activity/decisions, regenerates `CONTROL_BOARD.md`, and validates configured local/repository paths.
- `src/lib/store.ts` exposes one `AppStore` contract. `APP_STORE=postgres` uses `PostgresAppStore` and fails clearly when `DATABASE_URL` is missing; `APP_STORE=json` is explicit development/test fallback and is blocked in production unless an emergency override is set.
- `src/lib/postgres-store.ts` maps runtime records to PostgreSQL/Neon with parameterized SQL and transactions. Relational tables preserve score history, approvals, jobs, tasks, QA, delivery, economics, transitions, decisions, activities, settings, applications, and reconciliation conflicts.
- `src/lib/reconciliation.ts` compares durable job state, local workspace files, GitHub ledger presence, and the generated board. Conflicts are persisted and surfaced instead of silently choosing a side.
- `db/migrations/0001_initial.sql` plus `0002_operational_memory.sql` contain the PostgreSQL/Neon-compatible model and operational-memory extensions.

## Deliberate Phase 1 deviations

1. Local JSON remains available for offline tests/demo, but it is not the production source of truth. Production hierarchy is PostgreSQL/Neon for transactional runtime queries plus GitHub for the auditable, recoverable operational ledger.
2. Proposal drafting is deterministic and truthful-template based. There is no paid AI API dependency and no fabricated portfolio/evidence layer.
3. A logical checkpoint uses GitHub Git Data API blobs/tree/commit/ref update to commit all seven workspace files, relevant artifacts, and `CONTROL_BOARD.md` together. A ref race fails rather than silently creating a partial checkpoint; orphan Git objects may remain server-side and can be garbage-collected by GitHub.
4. The UI uses a single-owner token/cookie gate when `APP_OWNER_TOKEN` is set. Local development without the variable is intentionally open only for a private local server.

## Data/audit invariants

- Score snapshots carry `score_v1`, component values, weights/contributions in the explanation, assumptions, risk flags, economic estimates, and an immutable frozen domain object.
- Source records retain original text and raw metadata as data; imported content is never executed and is rendered through React text escaping.
- Human gates create a pending approval, a durable decision row plus decision-ledger entry, an activity checkpoint, a job state update, and a control-board refresh.
- `ACTIVITY.md` and `DECISIONS.md` are append-only. State synchronization replaces only the current snapshot and never rewrites history.
- Each managed job receives an independent permanent code and directory. The test suite verifies two simultaneous workspaces do not cross-contaminate.

## Security posture

- No secrets are committed; `.env.example` contains placeholders only.
- URLs accept only HTTP(S), reject credentials and unsafe schemes, and imported values are validated before normalization.
- Mutations are guarded by `APP_OWNER_TOKEN` in production; GitHub credentials are read only from environment variables.
- Production dependencies are pinned and the current `pnpm audit --prod` result is clean. `pnpm.overrides` pins vulnerable transitive `postcss` and `sharp` packages to patched releases.
