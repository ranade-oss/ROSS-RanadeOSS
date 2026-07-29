# Automated bulk synchronization from Mike

ROSS periodically scans the first-parent history of
`Open-Legal-Products/mike` and processes every new upstream commit in one
bounded batch.

## Pipeline

1. **Discovery:** fetch Mike `main`, verify that the recorded cursor remains an
   ancestor, enumerate every new first-parent commit, and apply deterministic
   path, size, binary, deletion, and rename gates.
2. **Bulk adaptation:** a read-only Codex job reviews all deterministic
   candidates together and proposes one ROSS-specific patch. Upstream content
   is treated as untrusted data.
3. **Clean validation:** a fresh runner checks the structured result, enforces
   the allowlist again, applies the combined patch, updates the synchronization
   state and ledger deterministically, and runs `npm run check`.
4. **Independent review:** a second read-only Codex job reviews the exact
   validated patch. It may only approve or reject.
5. **Publication:** a clean write-capable runner confirms `main` has not moved,
   publishes the exact validated bytes to one `agent/upstream-bulk-*` PR, and
   leaves final-head Baseline, bounded repair, and merging to the existing
   trusted-agent workflows.

## Automatic scope

The synchronizer may adapt small changes under:

- frontend and website source/tests;
- backend utility/library code and backend tests;
- repository tests;
- ordinary documentation.

It rejects destructive changes and excludes workflows, dependencies,
lockfiles, authentication, authorization, security, cryptography, secrets,
permissions, legal/privacy/governance/release controls, schemas, migrations,
databases, RLS, tenants, providers, connectors, storage, deployment,
billing, telemetry, uploads/downloads, and architectural changes.

## Human-review boundary

No code PR is created when deterministic gates or the independent reviewer
consider the batch unsafe. Instead, a state-only PR advances the cursor and
records every item as deferred in `upstream-sync/ledger.md`. Deferred items can
later be selected for a focused ROSS-specific integration.

The workflow processes at most 100 first-parent commits per run, 12 files and
800 changed lines per upstream commit, and 25 files and 2,500 changed lines in
the combined ROSS patch. An existing open bulk-sync PR blocks another run.
