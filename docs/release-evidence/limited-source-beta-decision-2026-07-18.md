# Limited-source controlled-beta decision

- Release ID: `ross-public-beta-20260717-rc1`
- Decision date: 2026-07-18
- Accountable owner: AR
- Decision: approved for public controlled-beta launch without waiting for expanded Ontario case-law coverage expected after launch.

## Launch scope

ROSS may launch for the lawyer-reviewed Ontario workflows and for analysis of user-supplied synthetic or affirmatively non-confidential material. At launch, ROSS does **not** claim comprehensive coverage of the Ontario Court of Appeal, Ontario Superior Court of Justice, or Ontario Small Claims Court.

CanLII and CourtListener access use a bring-your-own-key model. Each user obtains any required API key directly from the provider and is responsible for having authorization to use it. ROSS does not provide, pool, or share those credentials. A user without either optional key must still be able to use the rest of ROSS; unavailable provider coverage is shown as a gap rather than blocking login or non-source-dependent work.

## Mandatory safeguards

- CanLII website scraping and browser automation remain prohibited.
- No platform-wide CanLII or CourtListener credential is required or represented as available.
- Per-user provider credentials remain isolated, encrypted at rest, and sent only from the backend to the corresponding approved API host.
- Missing or incomplete source coverage must be disclosed to the user.
- ROSS must not replace missing source results with model memory or imply that an incomplete search is comprehensive.
- Source-dependent output remains subject to the existing citation, provenance, and availability warnings.
- Live health checks remain required for each source that is enabled and required by the launch configuration.
- The synthetic-or-non-confidential data boundary remains unchanged.

## Deferred expansion

Expanded ONCA, ONSC, and Small Claims coverage is a post-launch source-expansion workstream. Enabling a new connector transport requires verified endpoint behaviour, live health evidence, public coverage updates, and a new governed candidate. Each CanLII or CourtListener user remains responsible for their own provider access. This decision does not authorize confidential data, public indexing, CanLII scraping, shared provider credentials, or a silent expansion of research claims.
