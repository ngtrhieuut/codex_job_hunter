# Operating Workflow

## Pipeline

### Stage 1 — Discovery
Scout Agent ingests opportunities from permitted sources.

Required output:
- source
- source URL / external ID
- title
- original description
- budget
- currency
- timestamp
- raw metadata

No application is submitted at this stage.

### Stage 2 — Normalize + Deduplicate
Extract:
- category
- technologies
- requested deliverables
- inferred acceptance criteria
- explicit deadline
- client constraints
- missing information

Deduplicate by external ID and semantic similarity.

### Stage 3 — Hard filter
Reject clear low-value, prohibited, scam, or platform-risk opportunities before expensive analysis.

Record reason code.

### Stage 4 — Score
Job Scorer produces:
- score
- expected value
- estimated AI effort
- estimated human minutes
- completion probability
- likely revision risk
- risks/assumptions
- recommended bid / floor

### Stage 5 — Shortlist
If score meets threshold, create proposal draft and move to `REQUIRES_APPLY_APPROVAL`.

### Gate A — Apply approval
Owner can:
- Approve
- Reject
- Ask for deeper analysis
- Modify proposed commercial terms

Only approved opportunities may move to application workflow.

### Stage 6 — Application preparation
Generate a final customized proposal package.

For MVP, external submission is manual unless an officially permitted integration is available and explicitly enabled.

Record actual submission timestamp and actual bid.

### Stage 7 — Outcome tracking
Application may move to:
- LOST
- WON_PENDING_CONTRACT

### Gate B — Contract approval
Before ACTIVE, owner confirms:
- final price
- scope
- timeline
- milestones
- relevant client access

### Stage 8 — Project kickoff
Project Manager creates:
- requirement snapshot
- acceptance criteria
- task plan
- test plan
- risks
- delivery definition

### Stage 9 — Build
Builder Agent implements the job.

Rules:
- use branch/PR workflow for material code changes
- maintain a work log
- run relevant tests frequently
- flag blocking unknowns

### Scope creep detection
If a new request materially changes effort, deliverables, timeline, external spend, or risk:

1. stop affected new work
2. calculate delta
3. prepare change recommendation
4. move to `SCOPE_CHANGE_REVIEW`

### Gate C — Scope change approval
Owner approves/rejects/reprices.

### Stage 10 — QA
An independent QA pass validates acceptance criteria.

QA can result in:
- `QA_FAILED` -> return to builder
- `READY_FOR_DELIVERY`

### Gate D — Delivery approval
Owner reviews delivery package.

Delivery package includes:
- summary
- changed files/features
- how to run/use
- tests performed
- known limitations
- client-specific instructions

### Stage 11 — Delivery / Revision / Acceptance
Track revisions separately from original scope.

### Stage 12 — Payment + Retrospective
Record:
- gross revenue
- fees
- external costs
- net revenue
- estimated/actual tokens if available
- AI time
- human minutes
- revisions
- acceptance outcome

Retrospective outputs:
- what was underestimated?
- what was reusable?
- should scoring weights change?
- is this a Product Factory candidate?

## Daily operating view

Dashboard should surface only actionable queues:

- High-score opportunities awaiting Apply Gate
- Client replies needing owner decision
- Active jobs with blockers
- Scope changes awaiting approval
- QA failures
- Deliveries awaiting approval
- Payments/outcomes needing recording

Avoid notification noise.

## Experiment discipline

For the first 30 days, do not optimize for maximum number of applications.

Optimize for:
- quality of selection
- first accepted paid completion
- lowest owner effort compatible with quality
- clean measurement

Use small batches and inspect outcomes before increasing volume.
