# ROSS Initial Product Boundary

Status: approved (amended for public registration and connected-provider responsibility)

Approved: 2026-07-15; amended 2026-07-17 and 2026-09-03

> ROSS will initially be a public-registration web application for Ontario
> lawyers and paralegals. Every user must create and verify an individual
> account; anonymous uploads and AI requests are not permitted. ROSS sends
> relevant information to user-selected models and connected services so they
> can perform requested functions. Confidential or privileged use is at the
> user's own risk. ROSS will preserve all Mike functionality and add verified Ontario
> and Canadian legal sources.

## Consequences

- The initial hosted service is a controlled beta, not a consumer legal-advice
  service.
- Public registration does not make the authenticated workspace anonymous or
  approve public sharing or indexing of user content.
- Users must have authority to use submitted information and must choose
  providers and settings whose handling of it meets their confidentiality,
  privilege, client-authorization, supervision, and professional obligations.
- Transmission to a selected provider is expected and necessary. The material
  risk is the provider's subsequent retention, training, human review,
  security, disclosure, subprocessors, or other use under its terms and
  settings.
- Ontario additions must not remove inherited Mike functionality, including
  optional U.S. research through CourtListener.
- Public claims must distinguish verified source coverage from incomplete,
  unofficial, unlicensed, or unavailable coverage.
- The public website, onboarding, application controls, terms, and privacy
  materials must communicate this boundary consistently.

## Adopted foundation defaults

- The legal operator and product, technical, and legal-content owners remain
  `TBD` and must be named before production launch.
- Public website, application, API, status, and support addresses use explicit
  placeholders until domains and communication channels are approved.
- Canadian data residency is the production target. Preview deployments may
  use other regions only with synthetic data and no secrets belonging to a
  production environment.
- The original ROSS visual foundation uses navy and teal without government,
  court, or other official symbols or implied affiliations.
- CourtListener remains available for inherited U.S. research. Ontario and
  Canadian research will use A2AJ, official sources, or negotiated/licensed
  providers. ROSS will not scrape CanLII contrary to its terms or without an
  applicable permission.

## Review triggers

Review this boundary before:

- changing the connected-provider responsibility model;
- charging for the hosted service;
- representing Ontario legal research as comprehensive;
- enabling organization-wide firm deployments; or
- adding a consumer-facing legal workflow.
