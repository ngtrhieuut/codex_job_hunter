# Neon Operations — Codex Job Hunter

Status: `LIVE_VALIDATED`
Validated: 2026-08-22
Repository: `ngtrhieuut/codex_job_hunter`

## Managed project

This is the dedicated Neon project for this repository. Do not use the unrelated `phudong-class-management` project.

| Resource | Value |
|---|---|
| Organization | `Hieu` (`org-billowing-dust-60775505`) |
| Neon plan at provisioning | `free` |
| Project name | `codex-job-hunter` |
| Project ID | `sweet-frog-85939680` |
| Region | `aws-us-west-2` |
| Default branch | `main` |
| Branch ID | `br-withered-resonance-afwcaan8` |
| Database | `neondb` |
| Role | `neondb_owner` |
| Console | [Neon project branch](https://console.neon.tech/app/projects/sweet-frog-85939680/branches/br-withered-resonance-afwcaan8) |

The branch is currently the default root branch and is not protected. Network access is at the Neon default. Before accepting real client data or deploying beyond a controlled experiment, review the [Neon production checklist](https://neon.com/docs/get-started/production-checklist.md), including plan, region, branch protection, IP Allow, connection pooling, and restore strategy.

## Runtime configuration

Production/runtime configuration is intentionally split from this document:

```text
APP_STORE=postgres
DATABASE_URL=<secret connection string held in the runtime secret manager>
GITHUB_TOKEN=<secret held in the runtime secret manager>
GITHUB_REPOSITORY=ngtrhieuut/codex_job_hunter
```

Retrieve or rotate the connection string through Neon MCP/Console. Never commit `DATABASE_URL`, a password, API key, token, cookie, or full connection URI to GitHub, Markdown, `.env.example`, logs, or PR comments. Use the [secure connection guidance](https://neon.com/docs/connect/connect-securely.md).

## Migration and validation runbook

Run from the repository with the secret supplied only to the current process:

```powershell
$env:APP_STORE = 'postgres'
$env:DATABASE_URL = '<secret connection string>'
pnpm db:migrate
pnpm test
```

`pnpm db:migrate` applies `db/migrations/0001_initial.sql` and `0002_operational_memory.sql`. Both migrations are idempotent; a second run completed successfully with only expected PostgreSQL `already exists / skipping` notices.

Validated evidence on 2026-08-22:

- Neon schema contains the 20 application tables, including opportunities, scores, proposals, approvals, applications, jobs, QA, delivery, economics, transitions, activities, decisions, settings, and reconciliation conflicts.
- Full `pnpm test` with `APP_STORE=postgres` and this `DATABASE_URL`: **8 test files and 27 tests passed**.
- The full lifecycle test passed through opportunity → shortlist → Apply Gate → manual application → won → price/contract gates → job → QA → delivery gate → restart/readback → accepted → paid. It completed in approximately 231 seconds in the full suite because the Neon compute/pooler path has cold-start and round-trip latency.
- Post-test database verification: `opportunities=0`, `jobs=0`, `applications=0`, `approvals=0`, and no open reconciliation conflicts. Test fixtures were removed by the test cleanup.

The default JSON-mode CI remains useful for fast offline validation. It intentionally skips live PostgreSQL tests when `DATABASE_URL` is absent; that is not evidence that production persistence is unavailable.

## Operating boundary

- PostgreSQL/Neon is the transactional runtime source.
- GitHub is the auditable/recoverable operational ledger; keep `CONTROL_BOARD.md`, job workspaces, and dated experiment reports checkpointed.
- Local JSON is development/test-only and must not be used for real-money jobs.
- No external application, proposal submission, client message, contract acceptance, spending, account change, or final delivery is automated by this project.
- Use Neon branches for isolated schema experiments or previews; do not reset the default branch casually.
