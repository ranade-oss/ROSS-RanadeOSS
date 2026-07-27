# Staging release-train debugging

Use **ROSS staging release-train debug** to reproduce a release failure without
touching the public-beta deployment. The workflow creates three deterministic,
run-scoped Fly apps, uses only secrets from the protected `staging-debug`
environment, disables sign-ups and scan dispatch, and rejects missing or
production-equal infrastructure.

## Protected environment contract

Configure `STAGING_FLY_API_TOKEN` for a dedicated staging Fly organization and
set `STAGING_FLY_ORG` and `PRODUCTION_FLY_ORG` to their distinct organization
identifiers. Validation fails closed when they are equal. Configure a dedicated
staging Supabase project plus S3-compatible bucket and set `STAGING_S3_BUCKET`;
do not copy production credentials into any `STAGING_*` secret. Configure all
five existing non-secret `PRODUCTION_*` app/resource comparison variables.
Missing or production-equal comparison values fail before provisioning.

Supabase accepts either a paired `sb_publishable_...`/`sb_secret_...` key set or
legacy JWT keys whose payloads explicitly identify `anon`/`service_role` roles.
Opaque keys are sent only in the `apikey` header and never as Bearer tokens. A
read-only preflight uses GET to validate auth settings and the minimum tables
and columns used by the hosted backend, derived from `backend/schema.sql` and
the governed open-source-submission migration. PostgREST can validate the
resulting schema shape but does not expose migration history to these API
credentials; this workflow does **not** claim to verify which migrations
produced that shape. The S3 preflight signs a read-only HEAD request for the
exact configured bucket. Any key, schema, column, or bucket failure stops the
run before Fly apps are created.

## Evidence and cleanup contract

The constant concurrency group serializes every staging-debug run. The job
builds immutable image digests and deploys worker, API, and web separately. The
runner first starts the exact immutable web digest locally with the rehearsal
runtime variables and unconditional container cleanup. It verifies port 3000,
`/login`, and `/api/runtime-config`, including release ID, API and app URLs,
disabled signups, and the accepted `rehearsal` environment. After deployment,
the probe verifies that Fly runs the same digest with the exact rehearsal
frontend configuration (`internal_port = 3000`, `/login` health check).

The forced web deployment changes the service port to an unreachable value. A
nonzero exit alone is insufficient: the preserved modified configuration must
show `internal_port = 9`, and Fly machine/check/status evidence must corroborate
the health-check failure. The observed `timeout reached waiting for health
checks to pass` and trailing `request canceled` wording is expected; pure
authentication, authorization, permission, DNS, connection, network, and
control-plane failures are rejected. Recovery redeploys the immutable
digest recorded immediately before injection, verifies the active digest, and
preserves both values in explicit restoration evidence. The full integration
probe then verifies post-restoration recovery.

The already-approved debug job performs immediate defensive cleanup in its own
`always()` path. An independent fallback cleanup job has no protected GitHub
environment, so it cannot wait for a second approval while apps remain
provisioned. Configure repository secret `STAGING_FLY_CLEANUP_TOKEN` with a
narrowly scoped credential that can only destroy staging-debug apps in the
dedicated staging Fly organization; never give it production access. The
fallback recomputes all three deterministic names even if setup, provisioning,
the debug job, or evidence handoff failed. Not-found is idempotent success; all
other cleanup errors fail closed. Candidate deployment, expected failure,
digest restoration, post-restoration probe, immediate cleanup, fallback cleanup,
debug artifact handoff, and final artifact
upload are recorded as separate outcomes. The workflow does not write a passing
result until cleanup succeeds, and its final step fails unless cleanup, artifact
upload, and the debug job all succeeded.

The workflow has read-only repository permission and deliberately contains no
production environment, production secret, promotion input, tag, release, or
deployment step. It must never be repurposed for production promotion. The real
staging workflow must be manually rerun and reviewed after this corrective
change; repository tests do not constitute that rerun.
