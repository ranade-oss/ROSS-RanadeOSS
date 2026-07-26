# Staging release-train debugging

Use **ROSS staging release-train debug** to reproduce a release failure without
touching the public-beta deployment. The workflow creates three run-scoped Fly
apps, uses only secrets from the protected `staging-debug` environment, disables
sign-ups and scan dispatch, and rejects missing or production-equal data origins.

Configure `STAGING_FLY_API_TOKEN`, a dedicated staging Supabase project, and a
dedicated staging S3-compatible bucket/endpoint in that environment. Set
`STAGING_FLY_ORG`; do not copy production credentials into any `STAGING_*`
secret. Environment approval should be limited to release operators.

The job runs the complete repository gate, builds immutable image digests,
deploys worker, API, and web separately, and captures command output plus Fly
status and logs after every stage. It then creates a real, deliberately invalid
web runtime release, proves that failure through the deployed runtime-config
endpoint, rolls Fly back to the recorded known-good release version, and probes
the deployed endpoint again to verify recovery. Its final `always()` path
collects failure diagnostics, destroys every run-scoped app, and uploads the
evidence for 30 days. A cleanup failure fails the job and requires an operator
to destroy the names recorded in `isolation.txt`.

The workflow has read-only repository permission and deliberately contains no
production environment, production secret, promotion input, tag, release, or
deployment step. It must never be repurposed for production promotion.
