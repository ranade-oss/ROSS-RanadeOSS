# ADR-004 — Hosting and data residency

- Status: Proposed
- Date: 2026-07-15
- Owners: Operator Abhi Ranade; privacy evidence retained by AR; technical owner TBD
- Review trigger: Selecting any production vendor, region, subprocessor, backup location, or support-access arrangement

## Context

Ontario legal professionals will reasonably care where documents, database
records, logs, backups, and model requests are processed. The owner selected a
Supabase Free project in ca-central and Fly application/API/worker deployment in
Toronto (`yyz`). The separately configured S3-compatible object-store endpoint
still requires provider and region verification.

## Options considered

1. Select the fastest global services without residency requirements.
2. Target Canadian storage and processing for ROSS-controlled production data,
   documenting every exception and transborder model request.
3. Self-host every dependency in Canada immediately.

## Decision

Use option 2 as the production target. Preview deployments outside Canada are
permitted only for synthetic data and must not contain production secrets. This
ADR does not infer the object-store provider from the Fly application host and
does not by itself authorize a production launch.

## Consequences

- The architecture inventory must cover primary storage, replicas, logs,
  analytics, email, backups, support access, and subprocessors.
- Model-provider processing location and retention must be disclosed separately.
- Marketing may say “Canadian data residency target,” not “all data stays in
  Canada,” until verified controls support the stronger claim.

## Follow-up

- [x] Select Canadian-region database and application hosting targets.
- [ ] Verify the S3 endpoint provider/region and provider terms without recording secrets.
- [ ] Exercise deletion, recovery-copy expiry, and isolated restore behaviour.
