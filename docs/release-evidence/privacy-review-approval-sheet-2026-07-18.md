# Independent privacy review and approval sheet

This sheet is for the privacy expert reviewing the exact ROSS public controlled-beta candidate. Complete only the decision section; do not include secrets, client facts, privileged material, or private vulnerability detail.

## Candidate and approved boundary

- Release ID: `ross-public-beta-20260717-rc1`
- Current base deployment commit: `9516a5a1cc4c2b92dc4d93593b1af6fffffb4845`
- Current base deployment run: `29638209959`
- Review applies to: the final commit containing this sheet and the generated SHA-256 release manifest for the same release ID
- Hosted mode: verified-account public controlled beta
- Allowed content: synthetic or affirmatively non-confidential only
- Prohibited content: real client, privileged, confidential, regulated, proprietary, or secret material
- Confidential use approved: no
- Public indexing approved: no
- Legal-source credentials: optional per-user CanLII and CourtListener keys; no shared ROSS credential
- Model credentials: hosted allowlist is OpenAI; the deployed service requires the applicable user or operator credential configuration

## Evidence to review

- `docs/privacy/privacy-impact-assessment-draft.md`
- `docs/privacy/data-inventory.json`
- `docs/privacy/retention-schedule.json`
- `docs/privacy/subprocessor-inventory.json`
- `docs/security/threat-model.md`
- `docs/security/incident-response.md`
- `docs/architecture/ADR-002-beta-data-boundary.md`
- `docs/architecture/ADR-004-hosting-and-residency.md`
- `docs/architecture/ADR-008-model-provider-controls.md`
- `docs/architecture/ADR-009-logging-and-deletion.md`
- `docs/release-evidence/controlled-beta-owner-approval-2026-07-18.md`
- `docs/release-evidence/limited-source-beta-decision-2026-07-18.md`
- Security reference: `CONSOLIDATED-RESULTS-TEMPLATE.json`, dated 2026-07-18

## Reviewer checks

Please assess the controlled-beta boundary and state any condition needed for:

1. notice and meaningful consent for accounts, uploads, model calls, legal-source queries, and optional API-key storage;
2. minimization, purpose limits, access control, account export/deletion, backup expiry, and incident records;
3. actual hosting, database, object-storage, email, model, monitoring, backup, and support vendors, including processing locations and retention;
4. the no-client-material rule and whether the acknowledgement and API enforcement are adequate compensating controls;
5. per-user CanLII, CourtListener, and model API keys, including encryption, backend-only use, deletion, and provider disclosures;
6. privacy/support contact, complaint handling, breach response, re-review triggers, and the effective privacy notice.

## Decision

- Decision: **Approved**
- Review date: 2026-07-18
- Reviewer name or retained-reference identifier: Independent privacy-expert sign-off dated 2026-07-18; evidence retained by AR; confidential contents not included.
- Role and qualifications: Privacy expert
- Independence from implementation: Yes
- Unresolved Critical findings: 0
- Unresolved High findings: 0
- Conditions, exclusions, expiry, or re-review triggers: None
- Evidence reference and retention owner: AR
- Signature or approval reference: Independent privacy-expert sign-off dated 2026-07-18; evidence retained by AR; confidential contents not included.

Approval is limited to this data boundary and the exact manifested candidate. It does not approve confidential client material, public indexing, shared provider credentials, CanLII scraping, new subprocessors, broader retention, or an unreviewed source/model/provider expansion.
