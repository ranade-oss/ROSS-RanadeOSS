# Deliverable D verification

Deliverable D consolidates every dependency-ready post-launch Ontario research
step into one implementation and upload while retaining the following internal
milestones:

- **ROSS-190 — Live source observation:** sanitized manual, daily, and
  deployment-time checks for A2AJ, Ontario e-Laws, and Justice Laws Canada.
- **ROSS-200 — End-to-end Ontario research:** authenticated deployed checks for
  coverage, search, fetch, passage extraction, and legislation sections.
- **ROSS-210 — A2AJ legislation expansion:** Ontario and federal legislation
  and regulation discovery through A2AJ's `laws` API mode, always labelled
  unofficial and linked back to the upstream source.
- **ROSS-220 — Owner-visible readiness:** provider state, enabled state,
  reported datasets, known Ontario gaps, and a deployed research-check button
  in Account → Features.
- **ROSS-230 — Release verification:** deterministic provider/readiness tests,
  a scheduled workflow, a deployment observation artifact, and preserved Mike
  regression gates.

## Acceptance evidence

- No API key, new database column, migration, or Supabase change is introduced.
- CourtListener remains available as the optional inherited U.S. provider.
- CanLII remains disabled and cannot be activated without the existing complete
  contract, credential, operation, retention, and transport entitlement.
- Operational artifacts contain provider IDs and sanitized status metadata but
  no queries, document text, credentials, user IDs, or response bodies.
- A2AJ legislation is never represented as an official reproduction.
- Legislation discovery can search all enabled matching providers; the Assistant
  is instructed to prefer e-Laws or Justice Laws for current official material.
- ONSC, ONCJ, Small Claims, HRTO, and LTB gaps remain visible when live coverage
  does not establish those datasets.
- Deterministic tests cover success, provider failure, response sanitization,
  A2AJ law-mode requests, section extraction, UI/API contracts, and deployment
  workflow retention.

## Manual release verification

1. Run **Verify Ontario legal sources** on the merged `main` branch.
2. Deploy private ROSS once and confirm its legal-source observation step is
   green.
3. Open **Account → Features → Legal-source readiness** and run the deployed
   research check.
4. In a new Assistant chat, ask one synthetic ONCA question, one Ontario statute
   question, and one federal statute question. Confirm that ROSS shows the
   source, exact passage, verification state, and official link without a page
   refresh.

These checks establish an experimental, source-grounded Ontario configuration.
They do not establish comprehensive legal accuracy, good-law status,
confidential-data suitability, independent approval, or licensed coverage for
missing courts and tribunals.
