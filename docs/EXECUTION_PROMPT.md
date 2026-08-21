# Codex Execution Goal

Read this entire repository before making implementation decisions. In particular, follow `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/JOB_SCORING.md`, `docs/WORKFLOW.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md`, and **`docs/JOB_STATE_PROTOCOL.md`**.

Also inspect:
- `CONTROL_BOARD.md`
- `jobs/_template/`

## Goal

Implement **Phase 0 and Phase 1** of Codex Job Hunter as a working MVP, including the persistent multi-job operating system.

The result must be a usable single-owner internal web app that can ingest technical job opportunities, normalize/deduplicate them, apply hard filters, score them deterministically, present a ranked/explainable opportunity queue, and persist meaningful per-job state/checkpoints to GitHub.

Do not implement autonomous application submission, marketplace credential automation, client messaging, payments, or contract acceptance in this phase.

## Working style

- Spawn subagents when parallel work materially improves speed or quality.
- Assign clear ownership to subagents such as architecture/database, frontend/dashboard, provider/import, scoring/testing, job-state synchronization, and security/QA.
- Use a stronger reasoning model for architecture and final QA if model routing is available; use a coding-optimized model for implementation; avoid expensive models for bulk mechanical tasks.
- Do not duplicate work between agents.
- Keep changes reviewable and testable.
- Prefer simple architecture over speculative abstraction.
- Persist meaningful operational progress to GitHub. Important status, blockers, review outcomes, and decisions must not exist only in model context or terminal output.

## Required deliverables

1. Working application scaffold
2. Database schema and migrations based on `docs/DATA_MODEL.md` for Phase 0–1 entities
3. `.env.example` with placeholders only
4. Manual opportunity creation
5. CSV/JSON import with validation and useful error reporting
6. Provider interface plus GitHub public-issue adapter
7. Normalization pipeline
8. Deduplication
9. Hard-filter engine with reason codes
10. Deterministic `score_v1` engine based on `docs/JOB_SCORING.md`
11. Immutable score snapshots
12. Opportunity inbox with filters/sorting
13. Opportunity detail with original source, normalized requirements, score explanation, risks, assumptions, and inferred acceptance criteria
14. Shortlist/reject workflow
15. Settings UI/config for Phase 1 thresholds
16. Seed/sample data sufficient to demonstrate ranking
17. Automated tests for scoring, hard filters, dedupe, import validation, and critical state transitions
18. CI for lint/typecheck/tests/build
19. Local setup documentation
20. Architecture/implementation notes documenting deviations from the specification
21. Persistent per-job workspace creation using the structure defined in `docs/JOB_STATE_PROTOCOL.md`
22. Job-state synchronization that updates each job's `STATE.md` and root `CONTROL_BOARD.md` on material changes
23. Append-safe handling for `ACTIVITY.md` and `DECISIONS.md`
24. Human-attention queue surfaced both in the app and `CONTROL_BOARD.md`
25. Review queue for jobs in `READY_FOR_INTERNAL_REVIEW` / `READY_FOR_HUMAN_REVIEW`
26. WIP-limit enforcement/warnings, initially max 3 `IN_PROGRESS` jobs
27. Detection/flagging of material DB↔GitHub state conflicts instead of silent overwrites
28. Tests for job state transitions, checkpoint persistence, human-gate state creation, and multi-job isolation

## Persistent job management — mandatory behavior

For any opportunity promoted to a managed job/workspace:

```text
jobs/JOB-YYYYMMDD-NNN-short-slug/
  STATE.md
  BRIEF.md
  TASKS.md
  DECISIONS.md
  ACTIVITY.md
  REVIEW.md
  DELIVERY.md
  artifacts/
```

Every meaningful completed task, blocker, review outcome, or human-decision request must result in an updated durable job checkpoint according to `docs/JOB_STATE_PROTOCOL.md`.

When human input is needed:
- update the job state to the appropriate `REQUIRES_*` status
- write a decision-ready question/recommendation
- update `CONTROL_BOARD.md` under `HUMAN ACTION REQUIRED`
- persist/commit the checkpoint
- stop only the gated external/commercial action; continue unrelated safe work when appropriate

When work is completed:
- update `TASKS.md`
- append to `ACTIVITY.md`
- update `STATE.md`
- refresh `CONTROL_BOARD.md` when relevant
- commit using the required operational commit prefix

The system must remain understandable with many concurrent jobs. Do not rely on one giant global state document.

## Technical defaults

Unless the current repository/environment strongly justifies alternatives:
- Next.js
- TypeScript
- PostgreSQL / Neon-compatible SQL
- Drizzle ORM or Prisma
- Tailwind or similarly lightweight UI styling
- Zod for validation

Do not create unnecessary services. A single deployable web application plus database is preferred for the MVP.

## GitHub discovery

Implement discovery through a provider abstraction. GitHub should be the first real provider.

The provider should be capable of ingesting public issues based on configured search criteria. Do not assume every GitHub issue is paid. Store evidence/metadata that may indicate a bounty or compensation, and let scoring/filtering handle uncertainty.

Do not spam repositories, create comments, open PRs, or contact maintainers automatically as part of Phase 1.

## Scoring implementation

The scoring engine must be deterministic and independently testable.

Separate:
- extracted/estimated feature values
- weighting/configuration
- final score calculation

Every score must include a human-readable explanation.

Do not hide hard-coded assumptions. Put tunable thresholds/weights into explicit configuration where reasonable.

For values that require AI inference but no model/API is configured, provide a clean interface and deterministic fallback/manual fields so the MVP remains runnable without paid external APIs.

## UI priority

Optimize for decision speed, not decoration.

The first screen should make it easy to answer:
- Which opportunities deserve attention now?
- Which jobs need my decision?
- Which jobs are currently in progress?
- Which jobs are blocked?
- Which jobs are ready for review?
- Why is this job ranked highly?
- What are the risks?
- How much money/time might it be worth?

Use clear badges for score, completion probability, risk, source, category, and status.

Mirror the operational categories from `CONTROL_BOARD.md`: human action required, active work, ready for review, blocked, pipeline/shortlist, recently completed.

## Security

Before finalizing:
- inspect dependency choices
- ensure no secrets are committed
- validate all imported data
- safely render untrusted job descriptions
- avoid executing arbitrary content from imported jobs/repositories
- protect mutation routes appropriately for the chosen single-owner auth strategy
- ensure client secrets/private data are never written into public job-state files

## Definition of done

Do not declare completion only because code exists.

Before finishing:
1. run formatter/linter
2. run typecheck
3. run unit/integration tests
4. run production build
5. fix failures
6. review the implementation against every Phase 0–1 acceptance criterion
7. perform an independent QA/security pass
8. verify multi-job isolation and state persistence
9. verify a simulated job can move through discovery → shortlist → human gate → active → review using durable files/checkpoints
10. verify a second simultaneous job does not overwrite or confuse the first
11. update README with exact local setup and architecture
12. summarize what is implemented, what remains, and any known risks

If credentials or external services are unavailable, implement everything possible locally and clearly document only the genuinely blocked integration step. Do not stop the whole project because one optional external dependency is missing.

## Output expected from Codex

At the end, provide:
- implementation summary
- architecture summary
- commands used to verify the project
- test/build results
- multi-job state persistence demonstration
- current `CONTROL_BOARD.md` summary
- remaining blockers
- recommended Phase 2 next steps
- any specification changes you recommend, with rationale

Before declaring the task finished, persist a final project checkpoint/summary in GitHub so the owner and another reviewer can understand the exact current state without relying on your chat context.

Begin by auditing the repository and producing a short internal task breakdown, then implement Phase 0 and Phase 1 without asking for confirmation on ordinary engineering choices.
