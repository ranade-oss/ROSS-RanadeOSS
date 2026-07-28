# Upstream integration plan

## Objective

Integrate useful changes from `Open-Legal-Products/mike` into ROSS incrementally while preserving the newly released production baseline.

## Stable baseline

- Production baseline commit: `525280ebb3b9dcb7e9f4cb4c5d12aef34089d72c`
- Release train: completed successfully with public promotion enabled
- Treat the resulting immutable release tag and release ledger as the rollback boundary

## Current divergence snapshot

The last comparison found the upstream repository ahead by 78 commits, with ROSS carrying substantial independent changes. Reconfirm the counts before each integration batch because upstream may continue moving.

## Non-negotiable ROSS protections

Do not weaken or replace the ROSS-specific:

- release train and staging-debug workflows
- immutable image-digest promotion
- production rollback and failure handling
- governed release manifest
- data-boundary controls
- upload and document scanning pipeline
- Ontario legal-source integrations and health checks
- public-beta operational evidence and policy controls

## Classification framework

Classify each upstream change before implementation:

- **Adopt** — can be incorporated substantially as written
- **Adapt** — useful, but must be manually ported around ROSS architecture or controls
- **Skip** — irrelevant, superseded, incompatible, or would regress ROSS safeguards
- **Investigate** — potentially useful but requires design, security, licensing, migration, or operational analysis

## Integration sequence

1. Refresh the upstream comparison and group commits by subsystem.
2. Start with a small, low-conflict batch such as isolated tests, documentation, dependency-safe fixes, or CI improvements.
3. Use a dedicated branch and focused PR for each coherent batch.
4. Preserve upstream attribution with `-x` when cherry-picking isolated commits; manually port changes when conflicts or ROSS-specific architecture make cherry-picking unsafe.
5. Run Baseline verification on every final PR head.
6. Refresh `reports/release-manifest-v1.json` whenever governed files change.
7. Run staging/debug when a batch affects deployment, runtime configuration, migrations, rollback, probes, legal-source operation, or release mechanics.
8. Merge only after required checks pass and there are no unresolved blockers.
9. Run a new production release train only after a meaningful, fully validated integration batch is ready.

## Initial work breakdown

- [ ] Reconfirm upstream and ROSS divergence from the current production baseline
- [ ] Produce a commit-by-commit or PR-by-PR Adopt / Adapt / Skip / Investigate inventory
- [ ] Identify the first low-risk integration batch
- [ ] Open the first focused integration PR
- [ ] Complete Baseline verification on the final PR head
- [ ] Refresh the governed release manifest if required
- [ ] Determine whether staging/debug is required for that batch
- [ ] Merge and document residual risk

## Guardrail

Do not perform a bulk merge of all upstream commits. Every batch must be reviewable, reversible, and independently validated.
