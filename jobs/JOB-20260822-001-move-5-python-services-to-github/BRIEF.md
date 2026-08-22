# Job Brief

## Source

- Platform/source: guru
- URL: https://www.guru.com/jobs/move-5-python-services-to-github/2120189
- Date discovered: 2026-08-22T03:57:43.625Z

## Normalized request

Bounded documentation and repository-hardening migration for five existing Dockerized Python services; no production credentials or deployment.

## Objectives

- Create five private GitHub repositories and organize one service per repository.
- Add correct .gitignore, dependency files, Docker files, and .env.example placeholders.
- Inspect the source for passwords, tokens, API keys, env files, and other sensitive information before the first commit.
- Build and test each service from a fresh clone.
- Write a plain-English README for each repository.
- Deliver one concise handover guide covering access, future changes, credential storage, and backup.
- Deliverables are repository structure, correct gitignore/dependency/Docker files, env.example placeholders, pre-commit secret checks, fresh-clone build and test verification for each service, five plain-English READMEs, and one handover guide.
- Each Docker image must build from a fresh clone; a credential-related startup error is acceptable where a live credential is required.

## Scope included

- Only the explicitly recorded opportunity requirements.

## Scope excluded

- External application, client messaging, contract acceptance, spending, and final delivery without human approval.

## Acceptance criteria

- [ ] Each Docker image builds successfully from a fresh clone without Docker, Python, dependency, path, or configuration errors.
- [ ] A live-credential startup failure is documented as acceptable where the service requires a credential.
- [ ] The five READMEs explain setup, configuration, logs, common problems, and repository structure.
- [ ] A second secret check occurs before the first commit and a final secret scan occurs before delivery.
- [ ] Repository or documentation problems reported within five working days are corrected before acceptance.
- [ ] No production-server access or live credentials are required.
- [ ] Each Docker image must build from a fresh clone; a credential-related startup error is acceptable where a live credential is required.
- [ ] Repository or documentation problems reported within five working days must be corrected before acceptance.

## Assumptions / unknowns

- Exact source archive and current service-specific build commands are supplied only after selection.
- Final quote and delivery time require owner approval before any Guru quote is sent.
- The source page's `send before August 31, 2026` is a platform submission window, not an approved delivery deadline.

## Commercial and operational evidence

- Public listing: fixed-price range `$150–250 USD`; 68 quotes; hired count `0`; quote window shown through August 31, 2026.
- Client profile: United States; total spend shown as `$998`; 5 jobs paid out of 13; 11 paid invoices (`100%`); outstanding invoices `0`.
- Payment caveat: the public page does not prove that this specific job is escrow-funded or reserved for a selected freelancer.
- Model output: `score_v1 81.25/100`, completion probability component `96`, model expected net revenue `$19.20`. These are screening estimates, not an award, payment, or revenue record.

## Risk assessment

- `implementation_effort`: five services and five fresh-clone build/test paths may exceed the initial estimate if the source archive is inconsistent.
- `source_unknowns`: service-specific commands and exact archive are withheld until selection; confirm them before accepting scope.
- `competition`: 68 quotes materially reduce win probability even though the technical scope is clear.
- `payment`: fixed budget and client payment history are positive evidence, but job-specific escrow is unverified.
- `security`: secret scanning is required; no production credentials or production access should be requested before an approved access plan.

## Evidence / source notes

https://www.guru.com/jobs/move-5-python-services-to-github/2120189
