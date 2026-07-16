# ROSS-020 public website scaffold verification

Date: 2026-07-15

Branch: `agent/ross-020-public-website`

## Scope

ROSS-020 adds `website/` as a separate public application. It does not change
the inherited authenticated frontend, backend, database schema, CourtListener
tools, model providers, authentication, document storage, or application data.

## Included

- Original responsive ROSS landing page using the approved navy/teal identity.
- Shared public header, footer, beta boundary, source attribution, and calls to
  the configured application and repository.
- Governed public content for Ontario, features, workflows, coverage, open
  source, security, privacy, terms, acceptable use, accessibility, contact,
  about, documentation, updates, status, subprocessors, and responsible AI.
- Dynamic placeholder routes for future workflow and update entries.
- Skip link, semantic landmarks, keyboard focus, reduced-motion handling,
  forced-colour handling, responsive layout, custom 404, error page, sitemap,
  robots policy, metadata, and favicon.
- Central configuration integration and deliberate `.invalid`, `TBD`,
  `foundation-only`, and no-index production blockers.
- Isolated website lint, build, artifact validation, and rendered-route tests.

## Verification result

| Check | Result | Notes |
|---|---|---|
| Agent visual review | Pass | Landing and Ontario pages render with correct hierarchy, limitations, navigation, and responsive-safe composition |
| Keyboard/navigation review | Pass | Semantic links navigate correctly; skip link and focus rules are present |
| Website lint | Pass | No website lint errors or warnings |
| Website production build | Pass | Vinext build produces a validated Cloudflare Worker artifact |
| Website route tests | Pass | Landing page, 19 required routes, dynamic entries, and custom 404 are exercised |
| Repository baseline tests | Pass | 16 of 16 contract tests passed, including four website boundary tests |
| Inherited backend/frontend builds | Pass | Existing backend TypeScript build and authenticated frontend production build passed unchanged |
| GitHub Actions | Pending | Runs after browser upload and pull-request creation |

## Important boundaries

- This scaffold is not a production website or approved legal/privacy notice.
- It performs no authentication, analytics, contact submission, or application
  data loading.
- It does not claim Ontario source integrations are live.
- Hosted deployment and public indexing are not authorized by this package.
