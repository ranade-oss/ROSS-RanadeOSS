# Staging release-train debugging

Use **ROSS staging release-train debug** to reproduce a release failure without
touching the public-beta deployment. The workflow creates three run-scoped Fly
apps, uses only secrets from the protected `staging-debug` environment, disables
sign-ups and scan dispatch, and rejects missing or production-equal data origins.
The infrastructure is staging-debug, while the frontend runtime environment is
the supported `rehearsal` value; both complete probes therefore expect
`rehearsal` rather than inventing an unsupported runtime enum.

Configure `STAGING_FLY_API_TOKEN`, a dedicated staging Supabase project, and a
dedicated staging S3-compatible bucket/endpoint in that environment. Set
`STAGING_FLY_ORG`; do not copy production credentials into any `STAGING_*`
secret. Configure all five non-secret `PRODUCTION_*` comparison variables for
the three production app names, Supabase URL, and storage endpoint. Validation
fails closed if any comparison identifier is absent or equals its staging
counterpart. Also configure `PRODUCTION_FLY_ORG`. The staging token must belong
to a dedicated organization with no authority over production applications;
missing or equal staging/production organization identifiers fail closed. In
particular, do not use `personal` when production applications are in that
organization. Environment approval should be limited to release operators.

The job runs the complete repository gate, builds immutable image digests,
but first performs read-only Supabase and storage checks. Both Supabase keys
must authenticate, required tables and migration-added columns must be visible,
and `HeadBucket` must succeed for `ross-staging-debug`. These checks do not write
data and run before any Fly app is provisioned. After building, the exact web
image is started locally with the workflow runtime variables; `/login`, port
3000, and `/api/runtime-config` must pass before Fly deployment.

The workflow deploys worker, API, and web separately and captures command output plus Fly
status and logs after every stage. It runs the exact complete integration probe
used by the release train, then attempts a deliberately invalid web deployment
whose unreachable service port must make `flyctl deploy` fail. The job asserts
that nonzero health-check result, records diagnostics, redeploys the recorded
known-good image digest through the normal retry wrapper, verifies the running
digest, and reruns the complete probe to verify recovery. The main job retains
defensive cleanup and uploads diagnostics for 30 days; a cleanup failure fails
closed and requires operator attention.

Runs are serialized because they share one staging Supabase project and bucket.
An independent `always()` cleanup job reconstructs app names from the GitHub run
ID and attempt, so it still runs after an ordinary main-job failure or timeout.
Passing evidence is phase-specific: candidate deployment, expected failure,
digest restoration, post-restoration probe, cleanup, and artifact-upload status
remain distinguishable; cleanup cannot coexist with an overall passing record.

The complete integration probe checks authentication and upload guards, including
the hosted data-boundary acknowledgement, but deliberately does **not** perform
an authenticated document upload or write user data.

The workflow has read-only repository permission and deliberately contains no
production environment, production secret, promotion input, tag, release, or
deployment step. It must never be repurposed for production promotion.
