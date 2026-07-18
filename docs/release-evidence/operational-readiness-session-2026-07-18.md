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
| Final-candidate CI | GitHub Actions baseline run `29643461669` for commit `8cda317e55f0b0ea990276f04816ba3a89ea9c9f`; complete `npm run check` succeeded | passed |
| Final-candidate private deployment | GitHub Actions run `29643814076`, job `88078545308`; secret/input validation, worker/API/web deploys, service verification, source observation, and deployed smoke tests succeeded | passed |
| Final-candidate source observation | Artifact `deployed-legal-source-health-29643814076`, digest `sha256:61f5742de3c86f555019b6e082d1b64f0b2eb790b32cfcf3c999d2e92651cddd`; e-Laws and Justice Laws healthy; optional A2AJ coverage gap disclosed | passed for limited-source mode |
| Migration compatibility | No files under `backend/migrations/` differ between deployed base `9516a5a1cc4c2b92dc4d93593b1af6fffffb4845` and candidate `8cda317e55f0b0ea990276f04816ba3a89ea9c9f`; the candidate deployed and smoked against the existing schema | passed; no candidate migration |
| Dependency review | Final-candidate CI ran the high/critical audit threshold for backend, frontend, and website; no High or Critical advisory blocked the run | passed; moderate/low advisories remain disclosed |
| Observability path | Base-candidate malware and worker-failure exercises delivered operator alerts; the final candidate does not change backend scan, alert, worker, storage, or deployment code, and its worker/API health checks passed | passed by unchanged-component evidence |

## Final-candidate authenticated staging journey

- Candidate commit: `8cda317e55f0b0ea990276f04816ba3a89ea9c9f`
- Deployment run: `29643814076`
- Environment: owner-only private ROSS deployment in Toronto
- Data: synthetic clean DOCX only
- Expected/downloaded SHA-256: `AA7456E760B0F419AE7D3098E8B05E7108ED160BB432F1F08593F5EC3D68F703`
- Login: passed
- Scanning state displayed: yes
- Open/download blocked while pending: yes
- Status changed to clean without manual refresh: yes
- Open/download after clean: passed
- Download hash matched: yes
- Unexpected security alert: none
- Document deletion remained effective after refresh: yes
- Result: passed

## Rollback and incident-recovery exercise

- Exercise date: `2026-07-18`
- Environment: owner-only private ROSS deployment in Toronto
- Exercise data: synthetic only
- Decision owner and incident lead: Abhi Ranade (AR)
- Known-good rollback target: commit `9516a5a1cc4c2b92dc4d93593b1af6fffffb4845`
- Rollback branch: `ops/rollback-base-9516a5a`
- Rollback workflow run: `29645038641`, job `88081768092`
- Rollback source-observation artifact: `deployed-legal-source-health-29645038641`, digest `sha256:2dd461937d040300f25dbb0bb29df2a3d247ed11dca5f49390f472041f484f02`
- Recovery target: `main` at commit `8cda317e55f0b0ea990276f04816ba3a89ea9c9f`
- Recovery workflow run: `29645346296`, job `88082557474`
- Recovery source-observation artifact: `deployed-legal-source-health-29645346296`, digest `sha256:f8f192a7d5c0be06fa8b52e543c3491b2419a28bb3d881bfd6bc3768cd90c61a`
- Schema decision: no database rollback or migration was required because no files under `backend/migrations/` differ between the targets
- Rollback result: worker, API, website, owner-only verification, required-source verification, deployed smoke tests, and evidence upload all passed
- Recovery result: the same deployment and verification sequence passed after returning immediately to the candidate on `main`
- User-visible boundary during exercise: owner-only; no public traffic and no confidential data
- Incident response exercised: freeze at a known commit, deploy the compatible known-good application, verify services, recover forward to the candidate, and verify the recovered service
- Owner result: passed and approved with no unresolved exercise finding

The paired runs demonstrate application rollback and forward recovery against the
unchanged database schema. They do not substitute for the isolated backup and
restore exercise below.

## Isolated backup and restore exercise

- Exercise ID: `ross-restore-20260718-67661f17effb`
- Provider and region: Supabase Free, Canada Central; Supabase Storage S3
- Recovery-point observation: `2026-07-18T14:52:01Z`
- Recovery-complete observation: `2026-07-18T15:04:34Z`
- Observed recovery duration: 753 seconds
- Database result: 26 public tables and 224 rows restored; source and target fingerprint `d513423341b94ef947932e997fe5682ca55b7391a5f4e6125318790361271247` matched
- Tenant-boundary result: zero orphan profiles, owner-mismatched documents, owner-mismatched folders, or orphan document versions
- Storage result: seven objects and 292,661 bytes copied; all hashes matched; sanitized manifest hash `b0d26c1c19fadf0d36181791b06d76cbb51ced88203f7554aa66c86645f212c7`
- Authentication result: target-only synthetic user and recovery link succeeded; no production password or session was copied
- Secret handling: no secret was written to the report or logical backup; the existing source S3 credential was provided through a non-echoing prompt and unset on exit
- Cleanup: source markers were removed by the runner; AR confirmed deletion of the isolated target project on 2026-07-18
- Evidence: `reports/backup-restore-exercise-2026-07-18.json`
- Result: passed and approved

This exercise proves the documented manual recovery method. Supabase Free does
not supply automatic daily database backups, and Supabase Storage does not
version objects. The controlled beta therefore makes no continuous-backup,
recovery-point, recovery-time, or deleted-object recovery commitment. Users
must retain local copies of material they need to preserve.
