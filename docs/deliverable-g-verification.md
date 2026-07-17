# Deliverable G verification

Deliverable G implements the approved expansion from invitation-only access to
verified public self-registration while retaining the hosted-beta data boundary
and all inherited Mike functionality.

## Implemented

- Separate manual `public-beta` Fly deployment with final-gate enforcement.
- Email-confirmation enforcement in the API, independent of frontend routing.
- Required terms/privacy and non-confidential-data acknowledgements at sign-up.
- Versioned registration evidence persisted by the Supabase auth trigger.
- Existing BYOK, authenticated content routes, RLS, export/deletion, rate limits,
  Ontario source controls, and private deployment remain intact.
- Public website and governance records updated to describe the actual model.
- Owner-only deployment reports known source degradation as a warning after a
  successful deployment, while retaining the sanitized artifact. Public-beta
  deployment keeps the source observation strict and blocking.

## Intentionally still blocked

Code readiness is not go-live approval. Provider authorization, Ontario lawyer
validation, independent legal/privacy/security/accessibility review, operational
exercises, operator/domains/effective notices/support decisions, and one
immutable approved release remain required by `npm run final:check`.

Confidential or privileged files are not authorized for the operator-hosted
beta. Public search indexing remains separately gated. CanLII website scraping
remains prohibited.
