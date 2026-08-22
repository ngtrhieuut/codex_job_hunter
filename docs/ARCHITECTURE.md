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
        +-- JsonAppStore (.data/store.json, local durable default)
        +-- PostgreSQL-compatible schema/migration (db/migrations)
        +-- provider adapters (manual, CSV/JSON, GitHub public issues)
        +-- job workspace / checkpoint adapter (jobs/<JOB-ID> + optional GitHub Contents API)
```

## Boundaries

- `src/domain/` is framework- and database-independent. It accepts JSON-compatible values, making scoring and validation deterministic and testable.
- `src/providers/` contains permitted source adapters. The GitHub adapter uses public issue search and records repository/label/bounty evidence; it does not comment, open PRs, contact maintainers, or submit proposals.
- `src/lib/ingestion.ts` orchestrates normalization, deduplication, hard filters, score snapshots, and store writes. Hard filters run before score generation.
- `src/lib/operations.ts` is the human-gated application/job state layer. It validates transitions, creates approval records, enforces the WIP limit, and checkpoints workspaces.
- `src/lib/job-workspace.ts` creates the required seven Markdown files plus `artifacts/`, updates `STATE.md`, appends activity/decisions, regenerates `CONTROL_BOARD.md`, detects DB/file state conflicts, and optionally syncs changed files through the GitHub Contents API.
- `src/lib/store.ts` uses a serialized JSON store for zero-credential local operation. `.data/` is ignored and is not a system-of-record substitute for job state: managed job state is written under `jobs/` and can be pushed to GitHub when `GITHUB_TOKEN` and `GITHUB_REPOSITORY` are configured.
- `db/migrations/0001_initial.sql` contains the PostgreSQL/Neon-compatible logical model for opportunities, immutable scores, proposals, approvals, jobs, criteria, tasks, QA, delivery, outcomes, transitions, provider configuration, settings, and product signals.

## Deliberate Phase 1 deviations

1. The application uses a durable local JSON store by default so it remains runnable without a database or paid service. The PostgreSQL schema and migration command are included, but a Postgres repository adapter is a follow-up before multi-instance or production deployment.
2. Proposal drafting is deterministic and truthful-template based. There is no paid AI API dependency and no fabricated portfolio/evidence layer.
3. GitHub Contents checkpoint sync currently writes changed files individually. A future implementation can replace this with a single Git Data API commit for stronger atomicity.
4. The UI uses a single-owner token/cookie gate when `APP_OWNER_TOKEN` is set. Local development without the variable is intentionally open only for a private local server.

## Data/audit invariants

- Score snapshots carry `score_v1`, component values, weights/contributions in the explanation, assumptions, risk flags, economic estimates, and an immutable frozen domain object.
- Source records retain original text and raw metadata as data; imported content is never executed and is rendered through React text escaping.
- Human gates create a pending approval, a decision-ledger entry, an activity checkpoint, a job state update, and a control-board refresh.
- `ACTIVITY.md` and `DECISIONS.md` are append-only. State synchronization replaces only the current snapshot and never rewrites history.
- Each managed job receives an independent permanent code and directory. The test suite verifies two simultaneous workspaces do not cross-contaminate.

## Security posture

- No secrets are committed; `.env.example` contains placeholders only.
- URLs accept only HTTP(S), reject credentials and unsafe schemes, and imported values are validated before normalization.
- Mutations are guarded by `APP_OWNER_TOKEN` in production; GitHub credentials are read only from environment variables.
- Production dependencies are pinned and the current `pnpm audit --prod` result is clean. `pnpm.overrides` pins vulnerable transitive `postcss` and `sharp` packages to patched releases.
