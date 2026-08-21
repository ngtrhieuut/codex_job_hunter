# Product Specification — Codex Job Hunter

## 1. Problem

Unused coding-agent quota has no economic value unless converted into accepted work or reusable products. Online freelance marketplaces contain many jobs, but manually searching, filtering, applying, planning, coding, testing, and tracking them creates large human overhead.

Codex Job Hunter should compress that overhead while keeping the owner in control of external commitments.

## 2. Product vision

An internal operating system for an AI-assisted micro-agency that can:

1. discover legitimate technical opportunities
2. normalize and deduplicate them
3. estimate expected economic value
4. rank opportunities by fit / risk / effort / revenue
5. draft customized proposals
6. stop for owner approval
7. convert won work into an executable project plan
8. delegate implementation and QA to coding agents
9. prepare delivery packages
10. measure actual commercial performance and improve scoring over time

## 3. Primary user

Single owner/operator. Multi-user SaaS is explicitly out of scope for the first version.

## 4. Opportunity sources

### MVP sources

- Manual entry
- CSV/JSON import
- GitHub public issues/bounty-like opportunities using permitted GitHub access

### Future adapters

- Marketplaces with official API/integration paths
- Email job alerts
- RSS feeds
- Public job boards where automated access is permitted
- User-provided exports

Every source must implement a provider adapter and record provenance.

## 5. Opportunity lifecycle

Statuses:

- `DISCOVERED`
- `NORMALIZED`
- `REJECTED_HARD_FILTER`
- `SCORED`
- `SHORTLISTED`
- `REQUIRES_APPLY_APPROVAL`
- `APPROVED_TO_APPLY`
- `APPLIED`
- `LOST`
- `WON_PENDING_CONTRACT`
- `ACTIVE`
- `SCOPE_CHANGE_REVIEW`
- `READY_FOR_QA`
- `QA_FAILED`
- `READY_FOR_DELIVERY`
- `DELIVERED`
- `REVISION`
- `ACCEPTED`
- `PAID`
- `CANCELLED`

State transitions must be explicit and auditable.

## 6. Dashboard

### Opportunity inbox

Display:
- title
- source
- category
- budget / currency
- discovery time
- overall job score
- completion probability
- estimated AI effort
- estimated human minutes
- risk level
- status

Filters:
- source
- category
- score
- budget
- risk
- status
- date

Sorting:
- expected value
- job score
- newest
- budget
- completion probability

### Opportunity detail

Show:
- original text/source URL
- normalized requirements
- acceptance criteria inferred from the post
- missing information
- technical fit analysis
- effort estimate
- risks
- scam flags
- bid recommendation
- minimum acceptable price
- proposal draft
- approval controls
- scoring explanation

### Active jobs

Show:
- client/source reference
- agreed scope
- price
- deadline
- acceptance criteria
- implementation status
- QA status
- scope change alerts
- human attention needed

### Analytics

Show at minimum:
- discovered
- hard-rejected
- shortlisted
- applied
- won
- paid
- application win rate
- accepted delivery rate
- gross revenue
- net revenue
- AI cost if known
- human time
- revenue / 1M tokens if token data available
- revenue/hour of human attention
- metrics by source/category

## 7. Hard filters

Reject before expensive analysis when any condition is clearly true:

- prohibited/illegal or malicious task
- clear scam signal
- impossible stated requirement
- unpaid work with no strategic value
- budget below configured floor for estimated effort
- identity/account circumvention
- request conflicts with platform rules
- vague scope plus low budget plus high communication burden
- requirement needs unavailable physical presence unless explicitly acceptable

Hard filter decisions must include reason codes.

## 8. Job categories

Initial taxonomy:

- python_bugfix
- js_ts_bugfix
- react_nextjs
- backend_api
- api_integration
- automation
- csv_excel
- data_processing
- web_scraping
- browser_extension
- bot
- dashboard
- deployment
- docker
- ci_cd
- database
- testing
- code_review
- security_review
- wordpress
- shopify
- ai_integration
- other

## 9. Proposal system

Proposal generation must use only truthful evidence.

Output fields:
- short opening tailored to problem
- interpretation of requirement
- concise implementation plan
- relevant capability/proof point
- assumptions
- clarifying questions only when material
- proposed price
- floor price
- timeline recommendation
- scope exclusions

Never fabricate portfolio projects, years of experience, certifications, ratings, client names, revenue, or previous results.

## 10. Job execution workspace

When a job becomes ACTIVE, create:

- immutable snapshot of agreed requirements
- acceptance criteria
- task breakdown
- risk register
- implementation notes
- test plan
- delivery checklist

Material new requirements trigger `SCOPE_CHANGE_REVIEW`.

## 11. QA requirements

QA should be independent from the primary implementation pass when practical.

Checks:
- requirement coverage
- tests
- regressions
- error handling
- setup reproducibility
- secrets scan
- dependency risks
- obvious security concerns
- output quality
- documentation

## 12. Product Factory signal

Track repeated demand patterns. A category/problem may be marked `PRODUCT_CANDIDATE` when:

- same pain appears repeatedly
- implementation is reusable
- buyer-specific customization is limited
- a standalone tool can produce a meaningful result
- ongoing infrastructure cost is reasonable

## 13. Configuration

Owner-editable settings should include:
- minimum budget
- maximum estimated AI hours
- maximum expected human minutes
- allowed categories
- excluded categories
- score threshold for shortlist
- minimum completion probability
- risk tolerance
- preferred currencies
- preferred sources

## 14. Auditability

Store:
- original source data
- normalized data
- score version
- score components
- model/agent metadata when available
- approval history
- state transition history
- outcome metrics

Economic experiments are useless if historical scoring cannot be reconstructed.

## 15. Privacy

Do not store more client data than needed. Secrets must live outside the DB/repository when possible. Support redaction of sensitive content before model processing when required.

## 16. MVP acceptance criteria

MVP is accepted when the owner can:

1. import or discover opportunities
2. see them ranked
3. inspect explainable scores
4. approve/reject an application decision
5. save a proposal draft
6. mark an opportunity won
7. manage implementation + acceptance criteria
8. move work through QA and delivery approval
9. mark revenue/payment outcome
10. view performance analytics
