# Mike OSS upstream synchronization review — 2026-07-17

ROSS was compared with `Open-Legal-Products/mike` at upstream commit
`0ed5050b21dade66feddc807d9fc5894bb147072`. The shared merge base was
`e32daad5a4c64a5561e04c53ee12411e3c5e7238`; ROSS was six commits behind and
46 commits ahead.

## Upstream changes reviewed

The six commits comprise three substantive changes and their merge commits:

- `f0b90ab` / `1d61634` — Library feature and shared-table refresh;
- `f5abbac` / `81590ea` — liquid-surface and document-review refinements; and
- `9eb63ef` / `0ed505` — Mike README update.

## Release-completion decision

- The README text is not copied because it describes Mike branding and would
  undo ROSS identity and Ontario disclosures.
- The document-viewer usability need is ported in ROSS form by adding the
  visible Download action while retaining authorized private download routes.
- The Library and broad shared-table/UI changes are valuable but touch roughly
  one hundred files, including authentication-adjacent routes, schema,
  documents, projects, tabular review, model selection, and navigation. They
  must be merged as a reviewed upstream synchronization change, not copied over
  ROSS files wholesale immediately before an immutable release.

## Required upstream integration procedure

1. Merge or port the Library/UI commits into the Deliverable H branch before
   the release is frozen.
2. Resolve conflicts in favour of ROSS where they concern branding, Ontario
   sources/workflows, public-account controls, hosted-data enforcement,
   security headers, deployment provenance, or governed release files.
3. Preserve the upstream functionality where there is no ROSS-specific
   conflict.
4. Add the upstream Library migration to both upgrade and fresh-schema paths.
5. Run Mike-preservation baseline tests plus ROSS security, Ontario source,
   website, frontend, backend, migration, and end-to-end checks.
6. Update the pinned Mike baseline only after the feature matrix and regression
   evidence prove the synchronization.

Do not mint an immutable release identifier until this decision is completed
or an accountable launch decision explicitly defers the Library/UI change to a
post-release milestone.

