# Proposal Draft — Move 5 Python Services to GitHub

Status: `DRAFT` — internal only; do not send without Hieu's approval.

Source: [Guru job 2120189](https://www.guru.com/jobs/move-5-python-services-to-github/2120189)

## Decision summary

- `score_v1`: **81.25/100**
- Completion-probability component: **96/100**
- Recommended fixed bid: **$250 USD**
- Internal minimum acceptable bid: **$200 USD**
- Internal delivery target: **2–3 working days after the source archive, access, and service-specific build commands are available**; this is not a commitment.
- External status: **no quote or message sent**.

The public page shows a fixed-price range of `$150–250`, 68 quotes, and no hire at capture. The client's profile shows 11 paid invoices and zero outstanding invoices, but the public page does not prove job-specific escrow funding. Hieu must decide whether that evidence is sufficient.

## Draft message

Hi, I can help with moving the five Python services into clean, private GitHub repositories.

My understanding is that the work is a bounded repository and documentation migration: one service per repository, correct dependency/Docker/configuration files, `.env.example` placeholders, secret checks before the first commit and before handover, fresh-clone Docker build/test verification, five plain-English READMEs, and one concise handover guide.

Proposed approach:

1. Review the supplied archive and confirm the current build/test command for each service.
2. Inspect for passwords, tokens, API keys, environment files, and other sensitive material before committing anything.
3. Create the five private repositories with the required structure and placeholders.
4. Build and test each image from a fresh clone, documenting any credential-only startup limitation.
5. Complete the READMEs and handover guide, then run the final secret scan.

I will verify the result against the recorded acceptance criteria and provide reproducible setup and test notes. This draft excludes new features, production deployment, live credentials, and unlisted support.

Final price and delivery timing require owner approval after the source archive and build commands are confirmed. This draft contains no unverified portfolio, client, credential, or experience claims.

## Included scope

- Five private GitHub repositories, one service per repository.
- `.gitignore`, dependency files, Docker files, and `.env.example` placeholders.
- Pre-commit and final secret scans.
- Fresh-clone Docker build/test verification for each service.
- Five plain-English READMEs and one handover guide.

## Excluded scope

- New features, refactors beyond migration corrections, or production deployment.
- Production credentials, live secrets, or production-server access.
- Ongoing support or changes outside the listed acceptance criteria.
- Any external quote, client message, contract, spend, or delivery before approval.

## Acceptance and stop conditions

- Stop and ask for clarification if a secret is found or if a service cannot be built from the supplied source without material changes.
- Do not accept scope expansion without a new human decision.
- Do not treat a credential-related runtime error as a build failure when the listing explicitly permits that limitation; document it with evidence.
