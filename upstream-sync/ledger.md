# Mike upstream synchronization ledger

This ledger records every first-parent commit observed on
`Open-Legal-Products/mike` after the synchronization cursor.

Automatic integration is deliberately limited to small, non-binary,
non-destructive changes in allowlisted source, test, and documentation paths.
Security-sensitive, authorization, schema, migration, dependency, deployment,
provider, connector, storage, legal, privacy, governance, release, and
architectural changes are recorded as **deferred** rather than integrated.

The initial cursor is `e89d3230db40193c540a6b38d8f301ae76377a1a`.
Changes through that commit were classified during ROSS PRs #32 and #34.
