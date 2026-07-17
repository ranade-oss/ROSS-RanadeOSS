# Deliverable F — final execution and controlled-beta completion

Deliverable F consolidates every step after E into one governed completion
package. It does not fabricate provider authorization or professional approval.

Included:

- one owner action sheet and external-engagement templates;
- a current Ontario provider procurement brief with explicit ONSC/Small Claims gaps;
- a seven-workstream final-completion record and deterministic dossier;
- human-readable `final:status` and fail-closed `final:check` commands;
- coherent release-ID, data-boundary, source-health, professional-validation,
  operations, launch, and release-readiness checks;
- a manual evidence workflow that never deploys;
- tests showing pending development integrity, unsafe-boundary rejection,
  production blocking, and a complete evidence-bearing pass case.

The recommended release remains invitation-only and synthetic/non-confidential.
ROSS preserves Mike, keeps CourtListener optional for U.S. research, retains
A2AJ and official legislation sources, and prohibits CanLII website automation.

Commands:

- `npm run final:status` — readable pending inventory; succeeds while records are structurally safe.
- `npm run final:check` — production completion gate; expected to fail until external evidence is complete.
- `npm run build:completion-dossier` — regenerate the governed completion report.
- `npm run test:final` — final-package integrity and report-staleness tests.

After F, there is no planned implementation package. Remaining work is the
external execution in `docs/final/owner-action-sheet.md`, followed by a release
only if `final:check` passes.
