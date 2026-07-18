# ADR-009 — Logging, audit, retention and deletion

- Status: Proposed
- Date: 2026-07-15
- Owners: Privacy evidence retained by AR; security owner AR
- Review trigger: Staging deployment, hosted user admission, incident response requirement, or data-boundary expansion

## Context

Operational logs help diagnose failures and security events but can accidentally
capture prompts, document text, legal queries, identifiers, tokens, or secrets.
Deletion must cover primary data and documented downstream copies.

## Options considered

1. Log request and response bodies for maximum debugging.
2. Disable all logs and audits.
3. Use structured metadata-only operational logs, separate security audit
   events, explicit retention, redaction, access controls, and tested deletion.

## Decision

Adopt option 3 as the design default. Never intentionally log document bodies,
prompt bodies, model responses, credentials, signed URLs, or access tokens.
For controlled-beta document objects, active and quarantine copies must be
removed within 24 hours of user/account deletion or terminal scan failure.
Encrypted recovery copies, if configured, expire within seven days and must not
be used to reverse an intentional deletion. Other provider retention periods
remain subject to inventory and operational verification.

## Consequences

- Logging helpers need allow-listed fields and automated secret/content tests.
- User deletion must document databases, objects, search indexes, caches, logs,
  backups, vendors, and legal holds.
- Audit access itself must be auditable and least-privileged.

## Follow-up

- [x] Create a data inventory and retention schedule.
- [ ] Add deletion, redaction, and restore tests in ROSS-130.
