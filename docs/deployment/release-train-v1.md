# ROSS Release Train v1

ROSS qualifies and rehearses one immutable set of private API, worker, and
frontend image digests. Public application promotion remains fail-closed
because the separately hosted public beta has no independent Supabase-backed
application deployment.

## Human workload

For the required non-production rehearsal:

1. Open **Actions → ROSS release train → Run workflow** on `main`.
2. Leave **Promote the rehearsed image digests to public production**
   unchecked.
3. If GitHub pauses at the existing `private-online` environment, click its
   approval button once.
4. Read the final green or red summary.

There is no release ID, app name, Fly command, secret value, cleanup command,
or rollback command for the operator to enter. A protected environment that
does not require reviewer approval reduces the rehearsal to one Run button.

The workflow uses the existing `private-online` environment secrets because
the three-service rehearsal exercises the private Supabase-backed application.
The public beta has no independent Supabase project and the workflow must not
request private application secrets from `public-beta`. All three rehearsal
apps have no public IPs, signups are disabled, and the API background document
dispatcher is disabled. The checks read the authentication settings, verify authentication,
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
6. Promotes and verifies the candidate worker and API digests while the web
   app remains on its verified baseline digest.
7. Raises a typed, rehearsal-only fault after recording that exact partial
   promotion. The fault is deterministic and does not depend on Fly rejecting
   an incompatible image or on health-check timing.
8. Restores all three baseline digests, verifies each digest, and repeats the
   service probes. Any real deployment or verification error remains distinct
   from the controlled fault and fails the workflow after rollback.
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

## Public application promotion is intentionally blocked

The public beta is a separately hosted website and has no independent Supabase
project. Selecting **Promote the rehearsed image digests to public production**
therefore fails before secret validation, image building, or any Fly change.
Do not copy `private-online` credentials into `public-beta` to bypass this
guard.

A future public application backend requires a separate architecture decision,
independent data services and credentials, updated governance evidence, and
regression coverage before this guard can be removed.

## Supported path

**ROSS release train** is the supported private application rehearsal path.
**Deploy private ROSS** remains the private deployment path. The public website
uses its dedicated hosting path; no Supabase-backed public application release
is currently supported. The workflow named **Legacy: deploy previously governed
public beta** is permanently blocked before it can request secrets or touch Fly.
