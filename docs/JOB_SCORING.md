# Job Scoring Framework

## Goal

Rank opportunities by expected economic value, not by budget alone.

All scores are 0–100 unless noted.

## Components

### Positive components

- `technical_fit` — match to capabilities and available tooling
- `completion_probability` — probability the job can be completed to acceptance
- `scope_clarity` — how explicit and testable the requirements are
- `payment_quality` — budget attractiveness relative to effort
- `repeatability` — reuse value for future jobs/products
- `client_quality` — evidence of serious buyer / clear communication, where legitimately available
- `verification_quality` — how objectively completion can be tested

### Negative components

- `implementation_effort`
- `human_attention`
- `communication_burden`
- `revision_risk`
- `platform_risk`
- `security_risk`
- `scope_creep_risk`
- `scam_risk`

## Hard filters

Do not calculate an expensive score when any configured hard filter is met.

Default reject examples:
- prohibited or malicious task
- obvious scam
- requires false identity/credentials/experience
- requires bypassing marketplace controls
- impossible physical/geographic requirement
- unpaid large trial task
- budget clearly below minimum viable price

## Derived metrics

### Expected net revenue

`expected_net_revenue = budget_midpoint * completion_probability * win_probability - expected_platform_fees - expected_external_costs`

Probabilities use 0–1 values.

For a pre-application job where win probability is not yet learned, use a conservative configured prior by source/category.

### Expected human efficiency

`revenue_per_human_hour = expected_net_revenue / max(expected_human_hours, 0.25)`

### Compute efficiency

When token/cost estimates exist:

`revenue_per_1m_tokens = expected_net_revenue / expected_tokens * 1_000_000`

If token data is unavailable, use estimated agent-hours as a temporary proxy and clearly mark it as estimated.

## Default weighted score v1

Positive subtotal:

- technical fit: 20%
- completion probability: 20%
- scope clarity: 12%
- payment quality: 15%
- verification quality: 8%
- repeatability: 8%
- client quality: 5%

Risk-adjustment subtotal:

- implementation effort: -3%
- human attention: -2%
- communication burden: -2%
- revision risk: -2%
- platform risk: -1%
- security risk: -1%
- scope creep risk: -1%

Normalize final score to 0–100.

Scam risk is not a normal weight: very high scam risk should hard-reject.

## Recommended thresholds

- `85–100`: Priority A — review for application immediately
- `75–84`: Priority B — strong candidate
- `65–74`: Priority C — apply only if pipeline capacity allows
- `50–64`: Watch / low priority
- `<50`: Reject by default

Default shortlist threshold: `75`.

## Estimation guidance

### Technical fit

90–100:
- stack is familiar
- tooling available
- task type is proven/repeatable

70–89:
- moderate unknowns, but well within normal engineering capability

Below 70:
- unfamiliar ecosystem, hardware dependency, obscure proprietary system, or missing access

### Completion probability

Use evidence, not confidence language.

Increase for:
- reproducible bug
- clear input/output
- tests
- documented API
- isolated change

Decrease for:
- legacy code without tests
- unclear environment
- third-party dependency uncertainty
- subjective design acceptance
- undocumented proprietary API

### Payment quality

Compare the budget against:
- estimated agent effort
- estimated human minutes
- revision probability
- platform fees
- likely external costs

Do not assume a high budget means high payment quality.

## Bid recommendation

Return:
- `recommended_bid`
- `minimum_bid`
- `pricing_basis`
- `included_scope`
- `excluded_scope`

The system never commits the bid externally without Price Gate approval.

## Learning loop

Maintain scoring versions (`score_v1`, `score_v2`, ...).

After sufficient outcomes, calibrate:
- actual win probability by source/category/score band
- actual completion probability
- estimated vs actual human time
- estimated vs actual revisions
- expected vs actual net revenue

Do not silently rewrite historical scores. Store the scoring version used at decision time.
