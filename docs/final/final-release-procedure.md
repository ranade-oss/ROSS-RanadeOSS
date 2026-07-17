# Final controlled-beta release procedure

## Prepare one candidate

1. Merge all reviewer-required corrections and start from clean `main`.
2. Assign a unique release ID to final completion, release approvals,
   operations readiness, launch readiness, and release-manifest configuration.
3. Update the professional-validation record and workflow catalogue only from
   completed evidence. Regenerate workflows and reports.
4. Run `npm run build:completion-dossier`, `npm run build:release-manifest`, and
   `npm run check`.
5. Deploy this exact commit to isolated staging and complete every evidence
   exercise and source observation without confidential material.
6. Download/retain the release-candidate evidence and link its immutable run.
7. Run `npm run final:status` for the readable inventory, then
   `npm run final:check` for the fail-closed gate.

## Promote or stop

If `final:check` is blocked, stop. Do not weaken a threshold, backdate an
approval, replace evidence with a placeholder, enable CanLII scraping, or
substitute a different build. Correct the underlying issue and create a new
candidate when evidence no longer matches.

If it passes, run the GitHub **Final controlled-beta evidence** workflow on the
same commit. Confirm the artifact contains the governed manifest, evaluation,
source-health, professional-validation, approval, operations, launch, and final
completion records. Record the human go/no-go decision and its time window.

Promote only the reviewed immutable images. Monitor authentication, storage,
chat/model availability, legal-source health, errors, latency, and security
events. Stop or roll back on any declared condition.

## Boundary after promotion

The approved endpoint remains invitation-only and accepts synthetic or
non-confidential content. Expanding users, practice areas, source operations,
public indexing, analytics, payment, or confidential/privileged data requires
a successor decision and review; it is not an administrative toggle.
