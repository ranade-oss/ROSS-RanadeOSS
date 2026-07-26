# ROSS Release Train v1

ROSS now qualifies, rehearses, and optionally promotes one immutable set of
API, worker, and frontend image digests. The same frontend image uses a small
public runtime configuration so staging and public production can use different
API origins without rebuilding.

## Human workload

For the required non-production rehearsal:

1. Open **Actions → ROSS release train → Run workflow** on `main`.
2. Leave **Promote the rehearsed image digests to public production**
   unchecked.
3. If GitHub pauses at the existing `public-beta` environment, click its
   approval button once.
4. Read the final green or red summary.

There is no release ID, app name, Fly command, secret value, cleanup command,
or rollback command for the operator to enter. A protected environment that
does not require reviewer approval reduces the rehearsal to one Run button.

The workflow reuses the existing `public-beta` environment secrets to avoid a
second credential setup. This is intentionally lower-touch than the preferred
practice of separate staging credentials. All three rehearsal apps have no
public IPs, signups are disabled, and the API background document dispatcher is
disabled. The checks read the authentication settings, verify authentication,
CORS, and upload guards, validate API-to-worker authorization with an invalid
no-write request, and observe public legal-source health. They do not create a
user, upload a document, rotate a production secret, alter production, or
exercise a data-writing path.

The existing Fly token already deploys all three production apps and should
normally be able to create the rehearsal apps. If it is app-scoped rather than
organization-scoped, the first run will stop before deployment and identify
`FLY_API_TOKEN` as the sole one-time human action.

## Automated rehearsal

The workflow:

1. Runs the complete engineering, audit, manifest, build, lint, route, and
   Docker preflight gates from a clean GitHub runner.
2. Builds and pushes each deployable image once, then resolves it to a
   `registry.fly.io/...@sha256:...` reference.
3. Creates these fixed apps if they do not exist:
   - `ross-ranadeoss-api-rehearsal`
   - `ross-ranadeoss-web-rehearsal`
   - `ross-ranadeoss-worker-rehearsal`
4. Reads the three current production image digests without changing them.
5. Deploys those production digests to private-only rehearsal apps as the
   rollback baseline, with worker dispatch disabled. Rehearsal auto-stop is
   disabled for the duration of the run; the workflow explicitly starts every
   Machine, waits for the `started` state, and selects that exact API Machine
   for the private-network probe.
6. Promotes the candidate worker and API digests, then deliberately deploys
   the incompatible API image to the rehearsal web app.
7. Requires the web health check to reject that image.
8. Restores all three baseline digests, verifies each digest, and repeats the
   service probes.
9. Successfully promotes all three candidate digests and verifies the
   rehearsal API, web app, private worker, runtime API origin, disabled signup
   state, authentication service, CORS boundary, upload guard, worker
   authorization, and current required legal sources.
10. Stops the rehearsal Machines and uploads one release ledger and the build
    logs.

The three rehearsal apps remain available for later runs. Their Machines are
held running only while the rehearsal is active, then explicitly stopped with
automatic start disabled. This avoids running-compute charges between runs and
keeps the tested candidate image digests associated with a Fly Machine. Small
stopped-Machine root-filesystem storage charges may remain.

An expected forced failure counts as success only when the workflow proves the
subsequent three-component rollback. A real failure, missing rollback, wrong
digest, unhealthy service, stale manifest, or missing secret fails closed.
The workflow attempts to stop rehearsal Machines even after a failed step.

## Later public promotion

Public promotion is a separate operator decision. Run the same workflow and
check **Promote the rehearsed image digests to public production**. It repeats
the non-production rehearsal in that same run, snapshots the current
production digests, verifies that all three current production services are
healthy, verifies the existing production secret names without reading or
changing their values, promotes the already-tested candidate digests without
rebuilding, and rolls all three production apps back if any deployment, health
check, or final release-record operation fails.

The workflow automatically chooses the next unused
`ross-public-beta-YYYYMMDD-rcN` identifier. Before production, it performs a
no-write permission and tag preflight. It creates the immutable tag and GitHub
release only after all three public services pass. The release ledger maps the
Git commit, candidate digests, baseline digests, forced failure, rollback
result, staging result, integration checks, legal-source observation, and
production result.

## Supported path

**ROSS release train** is the only supported public deployment path. The
workflow named **Legacy: deploy previously governed public beta** is
permanently blocked before it can request secrets or touch Fly.
