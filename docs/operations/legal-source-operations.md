# Legal-source health, quarantine, and recovery

`config/legal-source-operations.v1.json` defines required providers, maximum
observation age, failure thresholds, and recovery thresholds. A deployment
collector writes a sanitized `reports/legal-source-health-v1.json`. The checked-in
candidate report is the sanitized observation from private deployment run
`29643814076` at commit `8cda317e55f0b0ea990276f04816ba3a89ea9c9f`.

For each check, record only provider ID, state, time, source/dataset version,
failure/success counters, latency class, and a sanitized reason code. Do not log
queries, passages, user identifiers, tokens, or response bodies.

- A required provider that is stale, unavailable, degraded, unobserved, or
  quarantined blocks production promotion.
- For the owner-approved limited-source controlled beta, A2AJ is optional: its
  documented Ontario case-law coverage gap remains visible but does not block
  launch. Ontario e-Laws and Justice Laws Canada remain required.
- Three consecutive failures quarantine implemented providers by default.
- A quarantined provider requires two consecutive successes plus owner review
  before recovery.
- CanLII remains disabled unless a separate licence, approved transport, and
  activation review exist. Health policy never authorizes scraping.
- Optional A2AJ, CourtListener, and disabled CanLII states must remain visible
  but do not block the limited-source operational gate.

Run `npm run source:check` against an actual candidate observation. A failure
keeps the provider disabled or the release blocked. Source health is distinct
from comprehensive court/date coverage and from legal accuracy review.

Use the **Verify Ontario legal sources** GitHub Actions workflow for a sanitized
live observation of A2AJ, Ontario e-Laws, and Justice Laws Canada. See
`docs/operations/live-source-verification.md`. Its artifact is deliberately
separate from the checked-in pre-production report and does not by itself
authorize production or confidential-data use.
