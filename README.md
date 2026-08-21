# Codex Job Hunter

Codex Job Hunter is an experimental AI-assisted micro-agency system designed to turn unused coding-agent capacity into real, measurable online revenue.

The system is intentionally **human-gated** at money, commitment, account, and delivery-risk boundaries. It may discover, analyze, rank, draft, build, test, and package work autonomously, but it must not impersonate the owner, spam marketplaces, bypass platform rules, accept contracts, commit prices, or make irreversible external promises without approval.

## Core objective

Build a repeatable pipeline:

`Opportunity -> Score -> Human approval -> Proposal -> Win -> Execute -> QA -> Human approval -> Deliver -> Revenue`

Primary KPI:

`Revenue / 1M Codex tokens`

Secondary KPIs:

- Win rate
- Delivery acceptance rate
- Gross revenue
- Net revenue after platform fees
- AI cost per completed job
- Average human minutes per job
- Average cycle time
- Refund / revision rate
- Revenue by job category

## Initial experiments

### A. Freelance Hunter
Find small, well-scoped technical jobs with high AI completion probability.

Priority categories:
- Python bug fixes
- JavaScript / TypeScript / React fixes
- API integrations
- CSV / Excel automation
- Data transformation
- Web scraping where lawful and permitted
- Small dashboards
- Chrome extensions
- Telegram / Discord bots
- Deployment / Docker / CI fixes
- Test writing
- Database migrations

### B. GitHub Bounty Hunter
Find public paid issues, bounties, or sponsor-backed engineering tasks with clear scope and verifiable acceptance criteria.

### C. Product Factory
Use spare capacity to build small reusable tools, templates, scripts, extensions, and micro-SaaS products that can be sold repeatedly.

## Non-goals

The MVP must NOT:
- Auto-submit mass proposals on marketplaces
- Scrape or automate platforms in violation of Terms of Service
- Accept contracts automatically
- Negotiate final prices automatically
- Send client messages pretending to be the owner without an approval workflow
- Store marketplace passwords in the repository
- Perform automatic financial transactions
- Purchase connects, credits, ads, domains, APIs, or subscriptions
- Deliver unreviewed work to paying clients

## Human approval gates

1. **Apply Gate** — approve whether to apply
2. **Price Gate** — approve price / bid / milestone structure
3. **Contract Gate** — owner accepts final external agreement
4. **Scope Gate** — approve material scope changes
5. **Delivery Gate** — approve final client delivery

## Recommended MVP stack

Codex may change implementation details when justified, but default to:

- Next.js + TypeScript
- PostgreSQL via Neon
- Drizzle ORM or Prisma
- Auth suitable for a single-owner internal dashboard
- GitHub integration for bounty discovery and work tracking
- Structured provider adapters for future job sources
- Background jobs only where the deployment/runtime actually supports them
- Vercel for web deployment when practical

Keep the architecture simple. This is an experiment, not an enterprise platform.

## Where to start

Codex should read, in order:

1. `AGENTS.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/JOB_SCORING.md`
4. `docs/WORKFLOW.md`
5. `docs/DATA_MODEL.md`
6. `docs/ROADMAP.md`
7. `docs/EXECUTION_PROMPT.md`

Then implement Phase 0 and Phase 1 from the roadmap.

## Success criterion for the first 30 days

The goal is not scale. The goal is to prove one complete closed loop:

`AI-discovered opportunity -> human-approved action -> AI-assisted execution -> accepted deliverable -> payment`

Target: first $100 in attributable revenue without violating marketplace or platform rules.
