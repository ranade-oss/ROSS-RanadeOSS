# Upstream integration plan

## Objective

Integrate useful changes from `Open-Legal-Products/mike` incrementally while
preserving ROSS-specific security, privacy, legal-source, data-boundary, and
release controls.

## Required method

Every upstream change is classified before implementation:

- **Adopt** — incorporate substantially as written.
- **Adapt** — port the useful behaviour around ROSS architecture and controls.
- **Skip** — irrelevant, already implemented, superseded, or incompatible.
- **Investigate** — potentially useful, but requires focused security,
  migration, dependency, deployment, licensing, or product analysis.

Do not bulk-merge upstream. Each implementation batch must be independently
reviewable, reversible, and verified by Baseline on its exact final head.

## ROSS safeguards that upstream work must not weaken

- governed release train, immutable digest promotion, rollback, and manifests;
- authentication, authorization, MFA, and encrypted provider-key handling;
- data-boundary and upload/document scanning controls;
- Ontario legal-source integrations and health checks;
- privacy, public-beta evidence, and operational policy controls;
- trusted-agent final-head verification and bounded automatic repair.

## Completed low-risk inventory

| Upstream change | Classification | ROSS disposition |
| --- | --- | --- |
| `cb2306c5` — unify full-screen loading markup | **Adapt** | Ported in ROSS PR #32 while preserving `DataBoundaryGate`, auth redirects, and MFA behaviour. |
| PR #240 — prevent silently merge-corrupted lockfiles | **Adapt** | Extended across ROSS backend, frontend, website, and governance Baseline partitions in ROSS PR #34. |
| PR #234 — contributor testing policy and PR template | **Adapt** | Added ROSS-specific final-head, privacy, data-boundary, release, and upstream-provenance requirements in ROSS PR #34. |
| `fb3ec2d6` — ignore generated local Supabase scaffold | **Adopt** | Added `backend/supabase/` to `.gitignore` in ROSS PR #34. |
| PR #186 — remove unused `getUserIdFromRequest` helper | **Adopt** | Removed after confirming no repository references in ROSS PR #34. Active Express authentication middleware is unchanged. |
| `4728fd19` — pin Turbopack workspace root | **Skip: already implemented** | ROSS already sets `turbopack.root` to its resolved repository root. |
| PR #270 — discover workflow packs through `pack.yaml` | **Skip: architecture differs** | ROSS discovers governed workflows directly from `mike-workflows/system/*/SKILL.md`; it does not use upstream pack-directory discovery. |
| PR #258 — synchronize Bun lockfile | **Skip: not applicable** | ROSS uses npm lockfiles for its governed workspaces. |
| PR #236 — Anthropic-specific E2E key instructions | **Skip: superseded** | ROSS uses provider-neutral encrypted user keys and a separate dedicated `OPENAI_API_KEY` only for bounded CI repair. |
| PR #232 / reference CI workflow | **Skip: superseded** | ROSS has a partitioned Baseline, final aggregation gate, event-driven merge, manifest refresh, and bounded repair. |
| Reference Vitest/evals harnesses | **Skip: superseded for the low-risk batch** | ROSS already has governed backend, frontend build, website, evaluation, security, operational, and release checks. Broader new test dependencies require a separate dependency-reviewed batch. |

## Remaining work — not low risk

The remaining useful upstream areas require dedicated focused batches and are
not part of routine maintenance integration:

- ownership and authorization fixes for tabular reviews, projects, folders, and
  shared resources;
- RLS, schema, migration, Supabase, and tenant-isolation changes;
- prompt-injection, SSRF, download-token, connector-secret, CORS, and other
  security hardening;
- broad route-level, browser E2E, or new test-runner dependency additions;
- workflow-pack format changes with external repository dependencies;
- provider, local inference, storage, DMS, telemetry, queue, RAG, organization,
  service-layer, deployment, Docker, and air-gap architecture;
- changes affecting release, staging, rollback, production configuration, or
  public operational evidence.

For these categories, implementation begins only after architecture and threat
analysis identifies the ROSS-specific adaptation and validation requirements.
