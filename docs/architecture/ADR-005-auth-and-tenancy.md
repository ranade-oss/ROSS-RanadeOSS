# ADR-005 — Authentication, invitations, roles and tenancy

- Status: Accepted
- Date: 2026-07-15
- Owners: Product owner TBD; security owner TBD
- Review trigger: Organization accounts, external identity providers, paid access, or real client data
- Amended: 2026-07-17 — public verified self-registration adopted

## Context

Mike already uses Supabase Auth and user-scoped records. ROSS needs public
registration without weakening inherited authentication, MFA, export,
deletion, or sharing behaviour.

## Options considered

1. Public self-service sign-up.
2. Invitation-only individual accounts using inherited authentication.
3. Firm-level multi-tenancy with SSO and administrator roles at beta launch.

## Decision

Use option 1 for the first hosted beta, with safeguards. Preserve inherited
authentication and MFA. Require verified email, explicit terms/privacy and
data-boundary acknowledgement, authenticated content routes, BYO model
credentials, and bounded request rates. Do not treat email-domain membership
as authorization. Organization tenancy and SSO remain future decisions.

## Consequences

- Authorization must remain server-enforced and tested independently of UI.
- Registration state, email verification, account state, and data ownership
  must not be conflated.
- Sharing must not bypass beta admission or expose records across users.
- No claim of enterprise tenancy or SSO is permitted yet.

## Follow-up

- [ ] Exercise registration abuse, email-verification, suspension, deletion,
      and administrator-recovery paths.
- [ ] Threat-model auth, sharing, RLS, service keys, and account deletion.
