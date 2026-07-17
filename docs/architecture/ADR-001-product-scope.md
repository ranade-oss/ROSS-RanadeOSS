# ADR-001 — Product scope and intended users

- Status: Accepted
- Date: 2026-07-15
- Owners: Product owner TBD; legal-content owner TBD
- Review trigger: Paid access, real client data, a new user class, or a claim of comprehensive Ontario coverage
- Amended: 2026-07-17 — public verified self-registration adopted

## Context

ROSS needs a stable boundary before branding, hosting, legal content, or product
claims are implemented. The inherited Mike capabilities must remain usable.

## Options considered

1. Launch immediately as a public legal-advice product.
2. Run a controlled professional beta with limited materials and explicit gaps.
3. Remain a developer-only fork without an Ontario product direction.

## Decision

ROSS will initially be a public-registration web application for Ontario
lawyers and paralegals. Each user must verify an individual account; anonymous
uploads and AI requests remain disabled. During beta it will use synthetic or
non-confidential materials only, preserve all Mike functionality, and add
verified Ontario and Canadian legal sources. It is a professional work-support
tool, not a substitute for legal judgment and not a consumer legal-advice
service.

## Consequences

- Registration, onboarding, upload surfaces, website copy, and support must
  show the beta boundary consistently.
- Verified email, policy acknowledgement, request limits, and abuse monitoring
  are mandatory for the public hosted beta.
- Unsupported courts, practice areas, source gaps, and currency gaps must be
  visible rather than inferred away.
- A separate approval is required before admitting other data or user classes.

## Follow-up

- [ ] Name the operator and accountable owners.
- [ ] Approve the first supported Ontario practice areas.
