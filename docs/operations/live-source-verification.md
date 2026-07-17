# Live Ontario legal-source verification

ROSS includes provider-neutral Canadian research code, but fixture tests alone
do not establish that a deployed legal source is reachable or currently reports
the expected coverage. The **Verify Ontario legal sources** workflow performs a
small, read-only observation against the three public sources required by the
experimental Ontario configuration:

- A2AJ coverage must be reachable and must report the Ontario Court of Appeal
  (`ONCA`), Ontario legislation (`LEGISLATION-ON`), and Ontario regulations
  (`REGULATIONS-ON`). A2AJ text remains unofficial and incomplete.
- Ontario e-Laws must return a non-empty official legislation page.
- Justice Laws Canada must return legislation XML from the Department of
  Justice repository.

The workflow runs daily and can also be started manually. It uploads a
short-lived `legal-source-health-<run-id>` artifact containing only provider
IDs, timestamps, health states, counters, latency classes, source-version
headers or size classes, and sanitized reason codes. It never records search
queries, document text, user IDs, credentials, or response bodies.

The private deployment workflow runs the same sanitized observation after both
Fly services pass their health checks. In the authenticated app, **Account →
Features → Legal-source readiness** displays provider health and reported
coverage. Its **Run research check** button exercises the deployed
search/fetch/passage path for A2AJ plus current-source retrieval for Ontario
e-Laws and Justice Laws Canada.

## Operator procedure

1. Open **Actions → Verify Ontario legal sources → Run workflow** on `main`.
2. A green run establishes reachability for that observation only. It does not
   establish comprehensive coverage, legal accuracy, currency, good-law status,
   or permission to use confidential client material.
3. If the run is red, download the sanitized artifact and identify the degraded
   provider. Do not enable CanLII scraping or silently substitute model memory.
4. After the workflow passes, perform an authenticated ROSS Assistant smoke test
   using a synthetic ONCA question and inspect the cited source and passage.

No API key is required for these three checks. CourtListener remains an optional
credentialed U.S. provider and the licensed CanLII connector remains disabled.
