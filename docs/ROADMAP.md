# Implementation Roadmap

## Phase 0 — Foundation

Goal: create a safe, maintainable project skeleton.

Deliverables:
- initialize Next.js + TypeScript project
- linting / formatting / typecheck
- `.env.example`
- database client and migrations
- basic single-owner auth strategy
- CI workflow for lint/typecheck/tests/build
- seed/config mechanism
- architecture notes

Acceptance:
- app runs locally
- CI passes
- no secrets committed
- database schema can be created from scratch

## Phase 1 — Opportunity Intelligence MVP

Goal: owner can import opportunities, score them, and review a ranked queue.

Deliverables:
- opportunity schema
- manual opportunity form
- CSV/JSON import
- GitHub provider adapter for public issue discovery
- normalization service
- deduplication
- hard filter engine
- deterministic scoring engine v1
- explainable score breakdown
- opportunity inbox
- opportunity detail
- shortlist / reject actions
- settings for thresholds

Acceptance:
- import 100 sample opportunities
- duplicates are detected
- hard-filter reasons are visible
- all non-rejected opportunities receive reproducible score_v1 snapshots
- sort/filter works
- no external application action exists yet

## Phase 2 — Proposal + Approval Workflow

Goal: convert a shortlisted opportunity into an owner-approved application package.

Deliverables:
- proposal generation interface/service
- truthful evidence constraints
- recommended bid / floor
- included/excluded scope
- Apply Gate
- Price Gate
- approval audit log
- manual submission tracking

Acceptance:
- owner can approve/reject and edit proposal
- proposal cannot become SUBMITTED without required approval state
- every decision is auditable

## Phase 3 — Won Job Workspace

Goal: manage AI-assisted execution after a job is won.

Deliverables:
- contract confirmation Gate
- job workspace
- immutable agreed-scope snapshot
- acceptance criteria
- task breakdown
- risk register
- scope change detection/workflow
- QA runs
- delivery package
- Delivery Gate

Acceptance:
- job cannot enter ACTIVE before contract approval
- material scope changes have an explicit approval path
- READY_FOR_DELIVERY requires QA PASS
- final delivery is approval-gated

## Phase 4 — Economics + Learning

Goal: measure whether the system makes money efficiently.

Deliverables:
- economic outcome entry
- human-minutes tracking
- token/model usage capture where available
- source/category analytics
- Revenue / 1M tokens
- revenue / human hour
- win rate
- revision rate
- calibration report: predicted vs actual

Acceptance:
- a completed job can be traced from original opportunity through payment
- metrics can be sliced by source/category/score band

## Phase 5 — Product Factory

Goal: convert repeated freelance demand into reusable products.

Deliverables:
- repeated-problem clustering
- product candidate queue
- monetization hypothesis template
- lightweight validation workflow
- product experiment outcomes

Do not build a product automatically merely because a pattern appears. Rank candidates first.

## Phase 6 — Permitted Integrations

Only after the core workflow is stable.

Potential integrations:
- official marketplace APIs where access is granted
- email alerts
- RSS/job feeds
- Slack/notifications
- additional GitHub bounty sources

Requirements before enabling any write automation:
- verify current platform policy
- use official integration path
- rate limiting
- audit logs
- human approval gates remain active unless explicitly and safely redesigned

## First 30-day experiment

### Week 1
- complete Phase 0–1
- ingest opportunities manually/GitHub
- tune scoring using human review

### Week 2
- complete Phase 2
- generate 10–20 high-quality candidate application packages
- owner manually submits only selected opportunities

### Week 3
- complete Phase 3 basics
- execute any won tasks through the workspace
- record human intervention carefully

### Week 4
- complete economic dashboard
- retrospective
- identify the best source/category pair
- decide whether to scale, adjust scoring, or pivot

## Experiment constraints

During the first month:
- quality > application volume
- no mass submission
- no speculative large builds
- prefer small objective jobs
- record lost applications, not only wins
- record human time honestly

## Target

First attributable $100 of accepted paid work.

The experiment is successful if it proves the closed loop with acceptable owner effort and no platform-policy violations, even if total revenue remains small.
