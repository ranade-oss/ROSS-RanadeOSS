# Operational readiness session

- Release ID: `ross-public-beta-20260717-rc1`
- Current base deployment commit: `9516a5a1cc4c2b92dc4d93593b1af6fffffb4845`
- Current base deployment run: `29638209959`
- Environment: owner-only exact deployment on Fly.io and its configured Supabase/object-storage services
- Data used: synthetic only

## Evidence already observed

| Exercise | Evidence | Result |
| --- | --- | --- |
| Base deployment and smoke test | GitHub Actions run `29638209959`; deploy, required-source verification, and deployed smoke-test steps succeeded | passed for base commit |
| Source observation | Artifact `deployed-legal-source-health-29638209959`, digest `sha256:4a31f1774d0c4f794ee6820c64230dd661fba46fdfb920817fd9e0b265d7020c` | passed for base commit |
| Clean upload path | Exact-deployment Path A clean DOCX; scan result `clean`, `no_threats_found`, both hashes matched, quarantine cleared, promoted to clean | passed |
| Malformed DOCX path | Fake DOCX remained blocked before and after failure; expected failure row and alert observed | passed |
| Malware path | EICAR test remained blocked and generated the expected failure/security evidence | passed |
| Alert delivery | Worker failure and scan-failure alerts were observed during the exact-deployment exercises | passed |
| Security/accessibility review | Owner-approved report references in `controlled-beta-owner-approval-2026-07-18.md` | passed |

## Candidate-bound checks still required

The following cannot be inherited from the base deployment after code or governed records change:

1. run the complete engineering and immutable-candidate workflow on the final commit;
2. apply migrations to isolated staging and perform a forward compatibility dry run;
3. restore database, object storage, auth/configuration dependencies, and audit metadata into a new isolated environment, verify hashes and tenant boundaries, then destroy the exercise environment;
4. deploy the final candidate to staging, reverse traffic/configuration to the last known-good compatible artifact, and verify authentication, tenant isolation, uploads, source warnings, and health;
5. run the dependency review and incident tabletop against the final manifest; and
6. repeat live source observation for every source required by the final launch configuration.

These items remain pending until their dated evidence is tied to the final commit. A local simulation is not a substitute for the isolated restore or staging traffic rollback.
