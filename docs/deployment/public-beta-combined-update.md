# Public ROSS combined update

This update is limited to the public ROSS beta.

## Included

- Live discovery and validation of the complete A2AJ catalogue.
- Canadian jurisdiction and dataset filters for A2AJ decisions, legislation,
  and regulations.
- Offset pagination, duplicate suppression, catalogue metadata, citation
  network fields, and coverage warnings.
- Deterministic full-catalogue tests plus a sanitized live observation artifact.
- The existing per-user **CanLII API Key** field, unchanged.
- CanLII REST metadata, neutral-citation verification, and citator operations
  using only the authenticated user's encrypted key.
- User-directed CanLII full-text search links. ROSS does not crawl CanLII.
- HTTP-based signup service verification.
- One build-once release train with non-production rollback rehearsal.

The private-ROSS OpenAI-key, projects, connectors-page, model-availability, and
research-check defects are not part of this update.

## Merge with VS Code

1. Make sure the local repository is on `main` and up to date.
2. Extract the combined ZIP into the repository root. Choose **Replace All**
   when VS Code asks.
3. In Source Control, confirm the changes match `COMBINED-UPDATE-MANIFEST.txt`.
4. Commit all listed files and push `main`.

No database migration or new secret is required. Do not add a CanLII key to
GitHub or Fly. Each user continues to save their own key in
**Account → API Keys → CanLII API Key**.

## Release

Use **ROSS release train**. Its default run performs only the non-production
promotion-and-rollback rehearsal. It has no release-ID or app-name fields.
Public promotion is an explicit boolean choice on a later run, and the release
ID is generated automatically.

See [ROSS Release Train v1](release-train-v1.md) for the one-button rehearsal,
forced staging failure, three-component rollback, digest promotion, cleanup,
and operator summary.

Use the ROSS release train for public promotion. The former standalone public
deployment path has been removed, so there is no alternate deployment workflow
to run.

## CanLII boundary

The standard CanLII API is metadata-oriented. With a user's key, ROSS can list
case databases and decisions, retrieve case metadata, verify supported neutral
citations, and obtain cited/citing case or legislation metadata. It does not
turn topical terms such as “defamation” into a comprehensive full-text CanLII
search. ROSS generates a user-directed CanLII search link for that purpose.
